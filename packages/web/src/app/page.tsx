'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { Send, Clock, Check, CheckCheck, AlertCircle, MessageSquareOff, MessageCircle, ChevronDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { TemplateBuilder } from '../components/TemplateBuilder';

// Types
type Conversation = {
  id: string;
  contact_id: string;
  channel: string;
  unread_count: number;
  last_message_preview: string | null;
  last_message_at: string | null;
  contact_name: string | null;
  contact_phone: string;
};

type Message = {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed';
  created_at: string;
};

const API_URL = 'http://localhost:4000';

export default function InboxApp() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convCursor, setConvCursor] = useState<string | null>(null);
  const [hasMoreConvs, setHasMoreConvs] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);

  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgCursor, setMsgCursor] = useState<string | null>(null);
  const [hasMoreMsgs, setHasMoreMsgs] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const [composerText, setComposerText] = useState('');
  const [isSending, setIsSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Audio ref for incoming message sound
  // const audioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-scroll logic
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Poll conversations
  useEffect(() => {
    fetchConversations(true);
    const interval = setInterval(() => {
      // Re-fetch front of list quietly
      fetchConversations(true, true);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Poll messages for active conversation
  useEffect(() => {
    if (activeConv) {
      fetchMessages(activeConv.id, true);
      
      // Mark read when opening
      if (activeConv.unread_count > 0) {
        markAsRead(activeConv.id);
      }

      const interval = setInterval(() => {
        fetchMessages(activeConv.id, true, true);
      }, 3000);
      return () => clearInterval(interval);
    } else {
      setMessages([]);
    }
  }, [activeConv?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, isSending]); // Scroll down when new messages exist or sending starts

  const fetchConversations = async (reset = false, quiet = false) => {
    if (!quiet && reset) setLoadingConvs(true);
    try {
      const cursorParam = !reset && convCursor ? `?cursor=${encodeURIComponent(convCursor)}` : '';
      const res = await fetch(`${API_URL}/conversations${cursorParam}`);
      const json = await res.json();
      
      if (reset) {
        setConversations(json.data);
      } else {
        // Simple distinct append
        setConversations(prev => {
          const map = new Map(prev.map(c => [c.id, c]));
          json.data.forEach((c: Conversation) => map.set(c.id, c));
          // Re-sort by last_message_at
          return Array.from(map.values()).sort((a, b) => {
            const dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
            const dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
            return dateB - dateA;
          });
        });
      }
      if (!quiet || reset) {
        setConvCursor(json.cursor);
        setHasMoreConvs(json.hasMore);
      }
    } catch (err) {
      console.error('Error fetching conversations', err);
    } finally {
      if (!quiet) setLoadingConvs(false);
    }
  };

  const fetchMessages = async (convId: string, reset = false, quiet = false) => {
    if (!quiet && reset) setLoadingMsgs(true);
    try {
      const cursorParam = !reset && msgCursor ? `?cursor=${encodeURIComponent(msgCursor)}` : '';
      const res = await fetch(`${API_URL}/conversations/${convId}/messages${cursorParam}`);
      const json = await res.json();
      
      if (reset) {
        // Reverse because backend returns newest first, and chat UI shows newest at bottom
        setMessages([...json.data].reverse());
      } else {
        // Prepend older messages since we are scrolling up
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
      
      if (!quiet || reset) {
        setMsgCursor(json.cursor);
        setHasMoreMsgs(json.hasMore);
      }
      
      // Update our conversation list preview if latest message exists
      if (json.data.length > 0) {
        const latest = json.data[0];
        setConversations(prev => prev.map(c => 
          c.id === convId ? { 
            ...c, 
            last_message_preview: latest.body, 
            last_message_at: latest.created_at 
          } : c
        ));
      }
    } catch (err) {
      console.error('Error fetching messages', err);
    } finally {
      if (!quiet) setLoadingMsgs(false);
    }
  };

  const markAsRead = async (convId: string) => {
    try {
      await fetch(`${API_URL}/conversations/${convId}/read`, { method: 'POST' });
      setConversations(prev => prev.map(c => 
        c.id === convId ? { ...c, unread_count: 0 } : c
      ));
    } catch (err) {
      console.error('Error marking as read', err);
    }
  };

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!composerText.trim() || !activeConv) return;

    const body = composerText.trim();
    setComposerText('');
    setIsSending(true);

    // Optimistic UI update
    const optId = `opt_${Date.now()}`;
    const optMsg: Message = {
      id: optId,
      conversation_id: activeConv.id,
      direction: 'outbound',
      body,
      status: 'queued',
      created_at: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, optMsg]);
    setConversations(prev => prev.map(c => 
      c.id === activeConv.id ? { 
        ...c, 
        last_message_preview: body, 
        last_message_at: optMsg.created_at 
      } : c
    ));

    try {
      const res = await fetch(`${API_URL}/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeConv.id, body })
      });
      const returnedMsg = await res.json();
      
      // Replace optimistic message
      setMessages(prev => prev.map(m => m.id === optId ? returnedMsg : m));
    } catch (err) {
      console.error('Error sending message', err);
      // Mark failed
      setMessages(prev => prev.map(m => m.id === optId ? { ...m, status: 'failed' } : m));
    } finally {
      setIsSending(false);
    }
  };

  const retryMessage = async (msgId: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'sending' } : m));
    try {
      const res = await fetch(`${API_URL}/messages/${msgId}/retry`, { method: 'POST' });
      const returnedMsg = await res.json();
      setMessages(prev => prev.map(m => m.id === msgId ? returnedMsg : m));
    } catch (err) {
      console.error('Error retrying message', err);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'failed' } : m));
    }
  };

  return (
    <div className="app-layout" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TemplateBuilder />
      
      <div className="app-container" style={{ flex: 1, minHeight: 0 }}>
      
      {/* SIDEBAR */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>QuoSender Inbox</h1>
        </div>
        
        <div className="inbox-list">
          {loadingConvs && conversations.length === 0 ? (
            <div className="full-center"><div className="spinner"></div></div>
          ) : (
            <>
              {conversations.map(conv => {
                const isActive = activeConv?.id === conv.id;
                const initials = (conv.contact_name || conv.contact_phone).substring(0, 2).toUpperCase();
                
                let timeStr = '';
                if (conv.last_message_at) {
                  try {
                    timeStr = formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true });
                  } catch (e) {}
                }

                return (
                  <div 
                    key={conv.id} 
                    className={`conversation-item ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveConv(conv)}
                  >
                    <div className="avatar">{initials}</div>
                    <div className="conv-info">
                      <div className="conv-header">
                        <span className="conv-name">{conv.contact_name || conv.contact_phone}</span>
                        <span className="conv-time">{timeStr.replace('about ', '')}</span>
                      </div>
                      <div className="conv-preview">
                        {conv.last_message_preview || 'No messages yet...'}
                      </div>
                    </div>
                    {conv.unread_count > 0 && (
                      <div className="unread-badge">{conv.unread_count}</div>
                    )}
                  </div>
                );
              })}
              
              {hasMoreConvs && (
                <button className="load-more-btn" onClick={() => fetchConversations(false, false)}>
                  <ChevronDown size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} /> 
                  Load older
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* MAIN CHAT AREA */}
      <div className="chat-area">
        {!activeConv ? (
          <div className="empty-state">
            <MessageSquareOff className="empty-state-icon" />
            <p>Select a conversation to start messaging</p>
          </div>
        ) : (
          <>
            <div className="chat-header">
              <div>
                <h2>{activeConv.contact_name || activeConv.contact_phone}</h2>
                <p>{activeConv.contact_name ? activeConv.contact_phone : 'Phone Number'}</p>
              </div>
            </div>
            
            {/* TEMPORARY DEBUG PANEL 
            <div style={{ background: '#330000', padding: 10, margin: 10, borderRadius: 5, fontSize: '0.8rem', color: 'red' }}>
               <div><strong>DEBUG PANEL</strong></div>
               <div>Conv ID: {activeConv.id}</div>
               <div>Messages Fetched: {messages.length}</div>
               <pre style={{ whiteSpace: 'pre-wrap', maxHeight: '100px', overflowY: 'auto' }}>
                 {messages.length > 0 ? JSON.stringify(messages[messages.length - 1], null, 2) : 'No messages'}
               </pre>
            </div>
            */}

            <div className="messages-container">
              {hasMoreMsgs && (
                <button className="load-more-btn" style={{ margin: '0 auto' }} onClick={() => fetchMessages(activeConv.id, false, false)}>
                  Load earlier messages
                </button>
              )}
              
              {loadingMsgs && messages.length === 0 ? (
                <div className="full-center"><div className="spinner"></div></div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className={`message-wrapper ${msg.direction}`}>
                    <div className="message-bubble">{msg.body}</div>
                    <div className="message-meta">
                      {/* Time logic omitted for brevity in design, but status indicator below is key */}
                      {msg.direction === 'outbound' && (
                        <div className="status-indicator">
                          {msg.status === 'queued' && <Clock size={12} className="status-sending" />}
                          {msg.status === 'sending' && <Clock size={12} className="status-sending" />}
                          {msg.status === 'sent' && <Check size={12} className="status-sent" />}
                          {msg.status === 'delivered' && <CheckCheck size={14} className="status-delivered" />}
                          {msg.status === 'failed' && (
                            <div className="status-failed">
                              <AlertCircle size={12} />
                              <span className="retry-btn" onClick={() => retryMessage(msg.id)}>Failed. Retry?</span>
                            </div>
                          )}
                        </div>
                      )}
                      
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="composer-area">
              <form className="composer-box" onSubmit={sendMessage}>
                <MessageCircle size={20} color="var(--text-muted)" />
                <input 
                  type="text" 
                  className="composer-input"
                  placeholder="Type a message..."
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  disabled={isSending}
                />
                <button type="submit" className="send-btn" disabled={!composerText.trim() || isSending}>
                  <Send size={18} />
                </button>
              </form>
            </div>
          </>
        )}
      </div>

    </div>
    </div>
  );
}
