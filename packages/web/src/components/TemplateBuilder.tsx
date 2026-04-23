'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import './TemplateBuilder.css';
import { Copy, Save, Trash2 } from 'lucide-react';

const API_URL = '/api';

export interface Property {
  id: string;
  name: string;
  address: string;
  price: string;
  bedrooms: string;
  contact_phone: string;
  default_schedule: string;
  time?: string;
  city?: string;
  state?: string;
}

export interface Template {
  id: string;
  name: string;
  body: string;
}

const HIGHLIGHT_VARIABLES = new Set([
  'propertyName',
  'property_name',
  'name',
  'address',
  'price',
  'bedrooms',
  'schedule',
  'default_schedule',
  'time',
  'contactPhone',
  'contact_phone',
  'city',
  'propertyCity',
  'state',
  'propertyState'
]);

const TEMPLATE_TOKENS: Array<{ key: string; label: string }> = [
  { key: 'propertyName', label: 'propertyName' },
  { key: 'address', label: 'address' },
  { key: 'city', label: 'city' },
  { key: 'state', label: 'state' },
  { key: 'price', label: 'price' },
  { key: 'bedrooms', label: 'bedrooms' },
  { key: 'schedule', label: 'schedule' },
  { key: 'time', label: 'time' },
  { key: 'contactPhone', label: 'contactPhone' }
];

const createEmptyVars = () => ({
  address: '',
  price: '',
  bedrooms: '',
  schedule: '',
  time: '',
  contactPhone: '',
  city: '',
  state: '',
  notes: ''
});

const deriveCityState = (address?: string, city?: string | null, state?: string | null) => {
  let finalCity = (city ?? '').trim();
  let finalState = (state ?? '').trim();

  if ((!finalCity || !finalState) && address) {
    const segments = address
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);

    if (!finalCity && segments.length >= 2) {
      finalCity = segments[segments.length - 2];
    }

    if (!finalState && segments.length >= 1) {
      const trailing = segments[segments.length - 1]
        .split(/\s+/)
        .map(part => part.trim())
        .filter(Boolean);
      if (trailing.length) {
        finalState = trailing[0];
      }
    }
  }

  return { city: finalCity, state: finalState };
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
};

const parseErrorResponse = async (res: Response): Promise<string> => {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const data = await res.json();
      if (typeof data === 'string') return data;
      if (data && typeof data === 'object') {
        if ('error' in data && data.error) return String((data as Record<string, unknown>).error);
        if ('message' in data && data.message) return String((data as Record<string, unknown>).message);
      }
      return JSON.stringify(data);
    } catch {
      return `${res.status} ${res.statusText}`.trim();
    }
  }
  const text = await res.text();
  return text || `${res.status} ${res.statusText}`.trim();
};

const renderPlainText = (template: string, values: Record<string, string | undefined>): string => {
  const tokenRegex = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
  return template.replace(tokenRegex, (_, key: string) => values[key] ?? '');
};

const buildHighlightedNodes = (
  template: string,
  values: Record<string, string | undefined>
): React.ReactNode => {
  const nodes: React.ReactNode[] = [];
  const tokenRegex = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
  let lastIndex = 0;
  let counter = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(template)) !== null) {
    if (match.index > lastIndex) {
      const text = template.slice(lastIndex, match.index);
      nodes.push(<React.Fragment key={`text-${counter++}`}>{text}</React.Fragment>);
    }

    const tokenKey = match[1];
    const value = values[tokenKey] ?? '';
    if (value) {
      const highlight = HIGHLIGHT_VARIABLES.has(tokenKey);
      nodes.push(
        <span
          key={`var-${counter++}-${tokenKey}-${match.index}`}
          className={highlight ? 'tb-var-highlight' : undefined}
        >
          {value}
        </span>
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < template.length) {
    nodes.push(<React.Fragment key={`text-${counter++}`}>{template.slice(lastIndex)}</React.Fragment>);
  }

  return <>{nodes}</>;
};

export function TemplateBuilder() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  const [activePropId, setActivePropId] = useState<string>('');
  const [activeTmplId, setActiveTmplId] = useState<string>('');

  const [propName, setPropName] = useState('');
  const [vars, setVars] = useState(createEmptyVars());

  const [tmplName, setTmplName] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [propSaving, setPropSaving] = useState(false);
  const [propFeedback, setPropFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [tmplSaving, setTmplSaving] = useState(false);
  const [tmplFeedback, setTmplFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const templateTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [copiedPreviewId, setCopiedPreviewId] = useState<string | null>(null);

  const loadProperties = async (options?: { selectId?: string }) => {
    try {
      const res = await fetch(`${API_URL}/properties`);
      if (!res.ok) {
        const message = await parseErrorResponse(res);
        throw new Error(message);
      }
      const data: Property[] = await res.json();
      const normalized = data.map(prop => {
        const derived = deriveCityState(prop.address, prop.city, prop.state);
        return { ...prop, ...derived };
      });
      setProperties(normalized);

      const refList = normalized;

      if (options?.selectId) {
        setActivePropId(options.selectId);
      } else if (refList.length) {
        const exists = refList.some(p => p.id === activePropId);
        if (!activePropId || activePropId === 'new' || !exists) {
          setActivePropId(refList[0].id);
        }
      } else {
        setActivePropId('new');
        setPropName('');
        setVars(createEmptyVars());
      }
    } catch (error) {
      console.error('Failed to load properties', error);
      setPropFeedback({ type: 'error', message: `Failed to load addresses: ${toErrorMessage(error)}` });
    }
  };

  const loadTemplates = async (options?: { selectId?: string }) => {
    try {
      const res = await fetch(`${API_URL}/templates`);
      if (!res.ok) {
        const message = await parseErrorResponse(res);
        throw new Error(message);
      }
      const data: Template[] = await res.json();
      setTemplates(data);

      if (options?.selectId) {
        setActiveTmplId(options.selectId);
      } else if (data.length) {
        const exists = data.some(t => t.id === activeTmplId);
        if (!activeTmplId || activeTmplId === 'new' || !exists) {
          setActiveTmplId(data[0].id);
        }
      } else {
        setActiveTmplId('new');
        setTmplName('');
        setTemplateBody('');
      }
    } catch (error) {
      console.error('Failed to load templates', error);
      setTmplFeedback({ type: 'error', message: `Failed to load templates: ${toErrorMessage(error)}` });
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      await loadProperties();
      await loadTemplates();
    };
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync variables when property changes
  useEffect(() => {
    if (!activePropId || activePropId === 'new') return;
    const prop = properties.find(p => p.id === activePropId);
    if (prop) {
      setPropName(prop.name || '');
      const location = deriveCityState(prop.address, prop.city, prop.state);
      setVars(v => ({
        ...v,
        address: prop.address || '',
        price: prop.price || '',
        bedrooms: prop.bedrooms || '',
        schedule: prop.default_schedule || '',
        time: prop.time || '',
        contactPhone: prop.contact_phone || '',
        city: location.city,
        state: location.state
      }));
    } else {
      setPropName('');
      setVars(createEmptyVars());
    }
  }, [activePropId, properties]);

  // Sync template text when template dropdown changes
  useEffect(() => {
    if (!activeTmplId || activeTmplId === 'new') return;
    const tmpl = templates.find(t => t.id === activeTmplId);
    if (tmpl) {
      setTmplName(tmpl.name || '');
      setTemplateBody(tmpl.body || '');
    } else {
      setTmplName('');
      setTemplateBody('');
    }
  }, [activeTmplId, templates]);

  const variableValues = useMemo(() => {
    const contact = vars.contactPhone ?? '';
    const propertyLabel = propName ?? '';
    const location = deriveCityState(vars.address, vars.city, vars.state);

    return {
      propertyName: propertyLabel,
      property_name: propertyLabel,
      name: propertyLabel,
      address: vars.address ?? '',
      price: vars.price ?? '',
      bedrooms: vars.bedrooms ?? '',
      schedule: vars.schedule ?? '',
      default_schedule: vars.schedule ?? '',
      time: vars.time ?? '',
      contactPhone: contact,
      contact_phone: contact,
      city: location.city,
      propertyCity: location.city,
      state: location.state,
      propertyState: location.state,
      notes: vars.notes ?? ''
    };
  }, [propName, vars]);

  const renderedText = useMemo(
    () => renderPlainText(templateBody, variableValues),
    [templateBody, variableValues]
  );
  const templatePreviews = useMemo(() => {
    const items = templates.map(t => {
      const body = activeTmplId === t.id ? templateBody : t.body || '';
      const rendered = renderPlainText(body, variableValues);
      const snippet = rendered.length > 140 ? `${rendered.slice(0, 140).trimEnd()}…` : rendered;
      return {
        id: t.id,
        name: t.name,
        rendered,
        snippet,
        highlighted: buildHighlightedNodes(body, variableValues)
      };
    });

    if ((!activeTmplId || activeTmplId === 'new') && templateBody.trim().length) {
      const rendered = renderPlainText(templateBody, variableValues);
      const snippet = rendered.length > 140 ? `${rendered.slice(0, 140).trimEnd()}…` : rendered;
      items.unshift({
        id: 'new',
        name: tmplName || 'New Template',
        rendered,
        snippet,
        highlighted: buildHighlightedNodes(templateBody, variableValues)
      });
    }

    return items;
  }, [templates, activeTmplId, templateBody, tmplName, variableValues]);

  const handleCopy = () => {
    if (!renderedText) return;
    navigator.clipboard.writeText(renderedText);
  };

  const handleCopyPreview = (text: string, id?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (id) {
      setCopiedPreviewId(id);
      setTimeout(() => {
        setCopiedPreviewId(current => (current === id ? null : current));
      }, 900);
    }
  };

  const handleInsertToken = (token: string) => {
    const ref = templateTextareaRef.current;
    const insertValue = `{{${token}}}`;

    if (!ref) {
      setTemplateBody(prev => prev + insertValue);
      return;
    }

    const { selectionStart = templateBody.length, selectionEnd = templateBody.length } = ref;
    const nextValue =
      templateBody.slice(0, selectionStart) + insertValue + templateBody.slice(selectionEnd);

    setTemplateBody(nextValue);

    requestAnimationFrame(() => {
      const cursor = selectionStart + insertValue.length;
      ref.focus();
      ref.setSelectionRange(cursor, cursor);
    });
  };

  // --- CRUD: Properties ---
  const handleAddProperty = () => {
    setActivePropId('new');
    setPropName('');
    setVars(createEmptyVars());
    setPropFeedback(null);
  };

  const handleSaveProperty = async () => {
    const trimmedName = propName.trim();
    if (!trimmedName) {
      setPropFeedback({ type: 'error', message: 'Address name is required.' });
      return;
    }

    setPropSaving(true);
    setPropFeedback(null);

    const trimmedAddress = (vars.address ?? '').trim();
    const trimmedPrice = (vars.price ?? '').trim();
    const trimmedBedrooms = (vars.bedrooms ?? '').trim();
    const trimmedContact = (vars.contactPhone ?? '').trim();
    const trimmedSchedule = (vars.schedule ?? '').trim();
    const trimmedTime = (vars.time ?? '').trim();
    const trimmedCity = (vars.city ?? '').trim();
    const trimmedState = (vars.state ?? '').trim();

    const location = deriveCityState(trimmedAddress, trimmedCity, trimmedState);

    const payload = {
      name: trimmedName,
      address: trimmedAddress,
      price: trimmedPrice,
      bedrooms: trimmedBedrooms,
      contact_phone: trimmedContact,
      default_schedule: trimmedSchedule,
      time: trimmedTime,
      city: location.city,
      state: location.state
    };

    const isNew = !activePropId || activePropId === 'new';
    const url = isNew ? `${API_URL}/properties` : `${API_URL}/properties/${activePropId}`;

    try {
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const message = await parseErrorResponse(res);
        throw new Error(message);
      }

      const saved: Property = await res.json();
      const savedLocation = deriveCityState(saved.address, saved.city, saved.state);
      setPropName(saved.name || trimmedName);
      setVars(prev => ({
        ...prev,
        address: saved.address || payload.address,
        price: saved.price || payload.price,
        bedrooms: saved.bedrooms || payload.bedrooms,
        schedule: saved.default_schedule || payload.default_schedule,
        time: saved.time || payload.time,
        contactPhone: saved.contact_phone || payload.contact_phone,
        city: savedLocation.city || payload.city,
        state: savedLocation.state || payload.state
      }));
      setPropFeedback({ type: 'success', message: `Address ${isNew ? 'created' : 'saved'} successfully.` });
      await loadProperties({ selectId: saved.id });
    } catch (error) {
      console.error('Failed to save property', error);
      setPropFeedback({ type: 'error', message: `Save failed: ${toErrorMessage(error)}` });
    } finally {
      setPropSaving(false);
    }
  };

  const handleDeleteProperty = async () => {
    if (!activePropId || activePropId === 'new') return;
    if (!window.confirm('Delete this saved address?')) return;
    try {
      const res = await fetch(`${API_URL}/properties/${activePropId}`, { method: 'DELETE' });
      if (!res.ok) {
        const message = await parseErrorResponse(res);
        throw new Error(message);
      }
      setPropFeedback({ type: 'success', message: 'Address deleted.' });
      await loadProperties();
    } catch (error) {
      console.error('Failed to delete property', error);
      setPropFeedback({ type: 'error', message: `Delete failed: ${toErrorMessage(error)}` });
    }
  };

  // --- CRUD: Templates ---
  const handleAddTemplate = () => {
    setActiveTmplId('new');
    setTmplName('');
    setTemplateBody('');
    setTmplFeedback(null);
  };

  const handleSaveTemplate = async () => {
    const trimmedName = tmplName.trim();
    const trimmedBody = templateBody.trim();
    if (!trimmedName) {
      setTmplFeedback({ type: 'error', message: 'Template name is required.' });
      return;
    }
    if (!trimmedBody) {
      setTmplFeedback({ type: 'error', message: 'Template body is required.' });
      return;
    }

    setTmplSaving(true);
    setTmplFeedback(null);

    const isNew = !activeTmplId || activeTmplId === 'new';
    const url = isNew ? `${API_URL}/templates` : `${API_URL}/templates/${activeTmplId}`;

    try {
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, body: templateBody })
      });

      if (!res.ok) {
        const message = await parseErrorResponse(res);
        throw new Error(message);
      }

      const saved: Template = await res.json();
      setTmplName(saved.name || trimmedName);
      setTemplateBody(saved.body || templateBody);
      setTmplFeedback({ type: 'success', message: `Template ${isNew ? 'created' : 'saved'} successfully.` });
      await loadTemplates({ selectId: saved.id });
    } catch (error) {
      console.error('Failed to save template', error);
      setTmplFeedback({ type: 'error', message: `Save failed: ${toErrorMessage(error)}` });
    } finally {
      setTmplSaving(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!activeTmplId || activeTmplId === 'new') return;
    if (!window.confirm('Delete this template?')) return;
    try {
      const res = await fetch(`${API_URL}/templates/${activeTmplId}`, { method: 'DELETE' });
      if (!res.ok) {
        const message = await parseErrorResponse(res);
        throw new Error(message);
      }
      setTmplFeedback({ type: 'success', message: 'Template deleted.' });
      await loadTemplates();
    } catch (error) {
      console.error('Failed to delete template', error);
      setTmplFeedback({ type: 'error', message: `Delete failed: ${toErrorMessage(error)}` });
    }
  };

  const isNewProperty = !activePropId || activePropId === 'new';
  const isNewTemplate = !activeTmplId || activeTmplId === 'new';
  const propertyStateLabel = isNewProperty ? 'New Address' : 'Editing Address';
  const templateStateLabel = isNewTemplate ? 'New Template' : 'Editing Template';
  const propertySaveLabel = propSaving ? 'Saving...' : isNewProperty ? 'Create Address' : 'Save Address';
  const templateSaveLabel = tmplSaving ? 'Saving...' : isNewTemplate ? 'Create Template' : 'Save Template';

  return (
    <div className="template-builder">
      <div className="tb-header">
        <h3>Template Builder</h3>
        <button className="copy-btn" onClick={handleCopy} disabled={!renderedText}>
          <Copy size={16} /> Copy Rendered
        </button>
      </div>

      <div className="tb-content">
        <div className="tb-controls">
          {/* PROPERTY DOCK */}
          <div className="tb-group">
            <div className="tb-label-row">
              <label>Property</label>
              <span className={`tb-state-pill ${isNewProperty ? 'is-new' : 'is-editing'}`}>{propertyStateLabel}</span>
            </div>
            <div className="tb-layout">
              <div className="tb-list">
                <button
                  type="button"
                  className={`tb-list-item ${isNewProperty ? 'is-active' : ''}`}
                  onClick={handleAddProperty}
                  disabled={propSaving}
                >
                  + New Address
                </button>
                {properties.map(p => (
                  <button
                    type="button"
                    key={p.id}
                    className={`tb-list-item ${activePropId === p.id ? 'is-active' : ''}`}
                    onClick={() => setActivePropId(p.id)}
                    disabled={propSaving}
                  >
                    {p.name}
                  </button>
                ))}
              </div>

              <div className="tb-detail">
                <input
                  className="tb-name-input"
                  type="text"
                  placeholder="Address Listing Name (e.g. 39 Dewey St)"
                  value={propName}
                  onChange={e => setPropName(e.target.value)}
                />

                <div className="tb-vars-grid">
                  <input type="text" placeholder="Address" value={vars.address} onChange={e => setVars(prev => ({ ...prev, address: e.target.value }))} />
                  <input type="text" placeholder="Price" value={vars.price} onChange={e => setVars(prev => ({ ...prev, price: e.target.value }))} />
                  <input type="text" placeholder="Bedrooms" value={vars.bedrooms} onChange={e => setVars(prev => ({ ...prev, bedrooms: e.target.value }))} />
                  <input type="text" placeholder="Contact Phone" value={vars.contactPhone} onChange={e => setVars(prev => ({ ...prev, contactPhone: e.target.value }))} />
                  <input type="text" placeholder="Schedule" value={vars.schedule} onChange={e => setVars(prev => ({ ...prev, schedule: e.target.value }))} />
                  <input type="text" placeholder="Time" value={vars.time} onChange={e => setVars(prev => ({ ...prev, time: e.target.value }))} />
                  <input type="text" placeholder="City" value={vars.city} onChange={e => setVars(prev => ({ ...prev, city: e.target.value }))} />
                  <input type="text" placeholder="State" value={vars.state} onChange={e => setVars(prev => ({ ...prev, state: e.target.value }))} />
                </div>

                <div className="tb-action-bar tb-action-bar--end">
                  <button onClick={handleSaveProperty} className="tb-btn tb-save" disabled={propSaving}>
                    <Save size={14}/> {propertySaveLabel}
                  </button>
                  <button onClick={handleDeleteProperty} className="tb-btn tb-del" disabled={isNewProperty || propSaving}>
                    <Trash2 size={14}/> Delete
                  </button>
                </div>

                {propFeedback && (
                  <div className={`tb-feedback ${propFeedback.type === 'success' ? 'tb-feedback--success' : 'tb-feedback--error'}`}>
                    {propFeedback.message}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* TEMPLATE DOCK */}
          <div className="tb-group" style={{ marginTop: 12 }}>
            <div className="tb-label-row">
              <label>Template</label>
              <span className={`tb-state-pill ${isNewTemplate ? 'is-new' : 'is-editing'}`}>{templateStateLabel}</span>
            </div>
            <div className="tb-layout">
              <div className="tb-list">
                <button
                  type="button"
                  className={`tb-list-item ${isNewTemplate ? 'is-active' : ''}`}
                  onClick={handleAddTemplate}
                  disabled={tmplSaving}
                >
                  + New Template
                </button>
                {templates.map(t => (
                  <button
                    type="button"
                    key={t.id}
                    className={`tb-list-item ${activeTmplId === t.id ? 'is-active' : ''}`}
                    onClick={() => setActiveTmplId(t.id)}
                    disabled={tmplSaving}
                  >
                    {t.name}
                  </button>
                ))}
              </div>

              <div className="tb-detail">
                <input
                  className="tb-name-input"
                  type="text"
                  placeholder="Template Label"
                  value={tmplName}
                  onChange={e => setTmplName(e.target.value)}
                />

                <div className="tb-token-row">
                  <span className="tb-token-row__label">Variables:</span>
                  <div className="tb-token-row__chips">
                    {TEMPLATE_TOKENS.map(token => (
                      <button
                        type="button"
                        key={token.key}
                        className="tb-token-chip"
                        onClick={() => handleInsertToken(token.key)}
                      >
                        {`{{${token.label}}}`}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  className="tb-tmpl-input"
                  ref={templateTextareaRef}
                  value={templateBody}
                  onChange={e => setTemplateBody(e.target.value)}
                  placeholder="Start typing your template here, use {{variable}}..."
                />

                <div className="tb-action-bar tb-action-bar--end">
                  <button onClick={handleSaveTemplate} className="tb-btn tb-save" disabled={tmplSaving}>
                    <Save size={14}/> {templateSaveLabel}
                  </button>
                  <button onClick={handleDeleteTemplate} className="tb-btn tb-del" disabled={isNewTemplate || tmplSaving}>
                    <Trash2 size={14}/> Delete
                  </button>
                </div>

                {tmplFeedback && (
                  <div className={`tb-feedback ${tmplFeedback.type === 'success' ? 'tb-feedback--success' : 'tb-feedback--error'}`}>
                    {tmplFeedback.message}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* PREVIEW */}
        <div className="tb-preview-box">
          <label>Live Preview</label>
          {templatePreviews.length ? (
            <div className="tb-preview-grid">
              {templatePreviews.map(item => {
                return (
                <div
                  key={`${item.id}-${item.name}`}
                  className={`tb-preview-card tb-preview-card--compact ${activeTmplId === item.id ? 'is-active' : ''} ${copiedPreviewId === item.id ? 'is-copied' : ''}`}
                  onClick={() => handleCopyPreview(item.rendered, item.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleCopyPreview(item.rendered, item.id);
                    }
                  }}
                >
                  <div className="tb-preview-card__body">
                    {item.rendered
                      ? <div className="tb-preview-snippet">{item.highlighted}</div>
                      : <span className="tb-preview-placeholder">Start typing to see this preview...</span>}
                  </div>
                  <div className="tb-preview-card__copy-hint">{copiedPreviewId === item.id ? 'Copied!' : 'Click to copy'}</div>
                </div>
              );
            })}
            </div>
          ) : (
            <div className="tb-rendered tb-rendered--empty">
              <span style={{ opacity: 0.5 }}>Rendered output will appear here...</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
