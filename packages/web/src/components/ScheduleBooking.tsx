'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Send, Clock, Check, CheckCheck, AlertCircle, MessageSquareOff, ChevronDown } from 'lucide-react';

const API_URL = '/api/schedule-booking';

type ParsedContact = {
  rawLine: string;
  phone: string;
  property: Record<string, any> | null;
  conversation: any;
};

type Message = {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed';
  created_at: string;
};

export const ScheduleBooking = () => {
  const [inputText, setInputText] = useState('');
  const [contacts, setContacts] = useState<ParsedContact[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [activeContact, setActiveContact] = useState<ParsedContact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [hasMoreMsgs, setHasMoreMsgs] = useState(false);
  const [msgCursor, setMsgCursor] = useState<string | null>(null);
  
  const [templates, setTemplates] = useState<any[]>([]);
  const [composerText, setComposerText] = useState('');
  const [syncingQuo, setSyncingQuo] = useState(false);
  const [isSendingFlow, setIsSendingFlow] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleRetrieve = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/parse-and-load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText })
      });
      const json = await res.json();
      if (json.data) {
        setContacts(json.data);
      }
    } catch (err) {
      console.error('Failed to parse text', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncQuo = async (phoneToSync: string, convIdToSync: string, silent = false) => {
    if (!silent) setSyncingQuo(true);
    let success = false;
    try {
      await fetch(`${API_URL}/sync-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneToSync })
      });
      // Refresh local messages
      await fetchMessages(convIdToSync, true, true);
      success = true;
    } catch (err) {
      console.error('Failed to sync Quo', err);
    } finally {
      if (!silent) setSyncingQuo(false);
    }
    return success;
  };

  const fetchMessages = async (convId: string, reset = false, isAfterSync = false) => {
    if (reset) setLoadingMsgs(true);
    try {
      const cursorParam = !reset && msgCursor ? `?cursor=${encodeURIComponent(msgCursor)}` : '';
      const res = await fetch(`${API_URL}/messages/${convId}${cursorParam}`);
      const json = await res.json();
      
      if (reset) {
        setMessages([...json.data].reverse());
      } else {
        setMessages(prev => {
          const fetched = [...json.data].reverse();
          const map = new Map(prev.map(m => [m.id, m]));
          const combined = [];
          for (const m of fetched) {
            if (!map.has(m.id)) {
              combined.push(m);
              map.set(m.id, m);
            }
          }
          return [...combined, ...prev].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        });
      }
      
      setMsgCursor(json.cursor || null);
      setHasMoreMsgs(json.hasMore || false);
      
      // Auto-sync from Quo if no messages locally and we haven't just synced
      if (reset && json.data.length === 0 && !isAfterSync) {
         // We must use activeContact from state, or rather the current phone number, but we don't have it in scope unless we pass it.
         // Wait, we need the phone number. Let's return the length so the caller can handle it.
      } else if (reset) {
         setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
      return json.data.length;
    } catch (err) {
      console.error('Error fetching messages', err);
      return 0;
    } finally {
      if (reset) setLoadingMsgs(false);
    }
  };

  const loadThreadAndSyncIfEmpty = async (contact: ParsedContact) => {
    setComposerText('');
    const count = await fetchMessages(contact.conversation.id, true);
    if (count === 0) {
       // Automatically sync from quo
       await handleSyncQuo(contact.phone, contact.conversation.id, false);
    }
  };

  const fetchTemplates = async (propertyId: string) => {
    try {
      const res = await fetch(`${API_URL}/templates/${propertyId}`);
      const json = await res.json();
      setTemplates(json.templates || []);
    } catch (err) {
      console.error('Failed to load templates');
    }
  };

  // When active contact changes, fetch their messages and related templates
  useEffect(() => {
    if (activeContact) {
      loadThreadAndSyncIfEmpty(activeContact);
      if (activeContact.property) {
        fetchTemplates(activeContact.property.id);
      } else {
        setTemplates([]);
      }
    } else {
      setMessages([]);
      setTemplates([]);
    }
  }, [activeContact]);

  const renderTemplateString = (templateBody: string) => {
    if (!activeContact?.property) return templateBody;
    const prop = activeContact.property;
    return templateBody.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
      return prop[key.trim()] || match;
    });
  };

  const fillTemplate = (templateBody: string) => {
    setComposerText(renderTemplateString(templateBody));
  };

  const handleSendFlow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeContact || !composerText.trim() || isSendingFlow) return;
    setIsSendingFlow(true);
    try {
      const res = await fetch(`${API_URL}/run-flow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: {
            parameters: activeContact.rawLine,
            message: composerText,
            phone: activeContact.phone
          }
        })
      });

      if (res.ok) {
        // Clear composer as it was sent to the automation server
        setComposerText('');
        
        // Wait 1.5 seconds for Quo's actual backend/API to register the new message 
        // sent by Playwright, then silently pull it into our UI.
        setTimeout(() => {
          if (activeContact) {
            handleSyncQuo(activeContact.phone, activeContact.conversation.id, true);
          }
        }, 1500);
      } else {
        console.error('Automation server returned error:', await res.text());
      }
    } catch (err) {
      console.error('Failed to run AnyClick flow', err);
    } finally {
      setIsSendingFlow(false);
    }
  };

  return (
    <div style={{ marginTop: 40, borderTop: '1px solid #333', paddingTop: 20, paddingBottom: 60, minHeight: 600 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 20px' }}>
        <h2 style={{ marginBottom: 20, color: '#fff' }}>Schedule Booking</h2>
        
        {/* Top bar: Paste input */}
        <div style={{ display: 'flex', gap: 15, marginBottom: 20 }}>
          <textarea
            style={{ 
              flex: 1, height: 100, backgroundColor: '#1e1e24', color: '#fff', 
              border: '1px solid #333', borderRadius: 8, padding: 12, resize: 'vertical'
            }}
            placeholder="Paste raw block here. Example:&#10;(212) 555-1234  123 Main St Apt 4B... (Rows from spreadsheets are fine)"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
          />
          <button 
            style={{
              backgroundColor: 'var(--accent-primary)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '0 24px', cursor: 'pointer', fontWeight: 600, height: 40
            }}
            onClick={handleRetrieve}
            disabled={loading || !inputText.trim()}
          >
            {loading ? 'Parsing...' : 'Retrieve'}
          </button>
        </div>

        {/* Split View */}
        {contacts.length > 0 && (
          <div style={{ display: 'flex', height: 600, border: '1px solid #333', borderRadius: 8, overflow: 'hidden', backgroundColor: 'var(--bg-panel)' }}>
            
            {/* Parsed Contacts Left Sidebar */}
            <div style={{ width: 320, borderRight: '1px solid #333', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: 15, borderBottom: '1px solid #333', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                <h3 style={{ margin: 0, fontSize: 14, color: '#aaa' }}>Parsed Contacts ({contacts.length})</h3>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {contacts.map((contact, idx) => {
                  const isActive = activeContact === contact;
                  const preview = contact.conversation?.last_message_preview || 'No messages';
                  
                  return (
                    <div 
                      key={idx}
                      onClick={() => setActiveContact(contact)}
                      style={{ 
                        padding: 15, cursor: 'pointer', borderBottom: '1px solid #222',
                        backgroundColor: isActive ? 'var(--bg-hover)' : 'transparent',
                        transition: 'background-color 0.2s'
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4, color: '#e2e8f0' }}>{contact.phone}</div>
                      <div style={{ fontSize: 12, color: contact.property ? '#10b981' : '#f59e0b', marginBottom: 6 }}>
                        Property: {contact.property ? contact.property.name || contact.property.address : 'Unmatched'}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {preview}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right Chat Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
              {!activeContact ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                  <div style={{ textAlign: 'center' }}>
                    <MessageSquareOff size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                    <p>Select a parsed contact to view thread</p>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ padding: 15, borderBottom: '1px solid #333', backgroundColor: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: 0, color: '#e2e8f0' }}>{activeContact.phone}</h3>
                      <div style={{ fontSize: 12, color: activeContact.property ? '#10b981' : '#f59e0b', marginTop: 4 }}>
                        {activeContact.property ? `Matched: ${activeContact.property.name || activeContact.property.address}` : 'No property matched for this row'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    
                    {/* Fixed Templates Column (Left Sidebar) */}
                    {templates.length > 0 && activeContact.property && (
                      <div style={{ 
                        width: 320, borderRight: '1px solid #333', padding: '15px 10px',
                        overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8,
                        backgroundColor: 'rgba(0,0,0,0.1)', flexShrink: 0
                      }}>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2, paddingLeft: 4 }}>Templates for {activeContact.property.name || 'Property'}:</div>
                        {templates.map(t => {
                          const preview = renderTemplateString(t.body);
                          const label = preview.length > 45 ? preview.slice(0, 45) + '...' : preview;
                          return (
                            <button
                              key={t.id}
                              onClick={() => fillTemplate(t.body)}
                              title={preview}
                              style={{
                                backgroundColor: '#1e293b', border: '1px solid #334155', color: '#e2e8f0',
                                padding: '10px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)', transition: 'all 0.2s',
                                whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
                                textAlign: 'left'
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Message List */}
                    <div className="messages-container" style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                      {hasMoreMsgs ? (
                        <div className="load-more-btn" style={{ margin: '0 auto', cursor: 'pointer' }} onClick={() => fetchMessages(activeContact.conversation.id, false)}>
                          Load earlier...
                        </div>
                      ) : (
                        messages.length > 0 && (
                          <div className="load-more-btn" style={{ margin: '0 auto', cursor: 'pointer', color: '#60a5fa', borderColor: '#3b82f640' }} onClick={() => handleSyncQuo(activeContact.phone, activeContact.conversation.id)}>
                            {syncingQuo ? 'Fetching from Quo...' : 'Fetch history from Quo'}
                          </div>
                        )
                      )}
                      
                      {loadingMsgs && messages.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#64748b', marginTop: 20 }}>Loading...</div>
                      ) : messages.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#64748b', marginTop: 40 }}>
                          {syncingQuo ? (
                             <div style={{ marginBottom: 12 }}>Syncing from Quo...</div>
                          ) : (
                             <div style={{ marginBottom: 12 }}>No messages found in Quo or Local DB.</div>
                          )}
                        </div>
                      ) : (
                        messages.map(msg => (
                          <div key={msg.id} className={`message-wrapper ${msg.direction}`}>
                            <div className="message-bubble">{msg.body}</div>
                            <div className="message-meta">
                              {msg.direction === 'outbound' && (
                                <div className="status-indicator">
                                  {msg.status === 'queued' && <Clock size={12} className="status-sending" />}
                                  {msg.status === 'sending' && <Clock size={12} className="status-sending" />}
                                  {msg.status === 'sent' && <Check size={12} className="status-sent" />}
                                  {msg.status === 'delivered' && <CheckCheck size={14} className="status-delivered" />}
                                  {msg.status === 'failed' && <AlertCircle size={12} className="status-failed" />}
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </div>

                  {/* Composer */}
                  <div style={{ padding: 15, borderTop: '1px solid #333', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                    <form className="composer-box" onSubmit={handleSendFlow} style={{ margin: 0 }}>
                      <input 
                        type="text" 
                        className="composer-input"
                        placeholder="Type a manual reply or click a template..."
                        value={composerText}
                        onChange={(e) => setComposerText(e.target.value)}
                        disabled={isSendingFlow}
                      />
                      <button type="submit" className="send-btn" disabled={!composerText.trim() || isSendingFlow} title="Trigger Playwright Automation">
                        <Send size={18} />
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
