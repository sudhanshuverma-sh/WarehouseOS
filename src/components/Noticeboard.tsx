import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileText, Mail, Megaphone, Plus, Search, Send, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { NoticeInput } from '../context/AppContext';
import { capabilitiesFor } from '../lib/permissions';
import { controlRoomSites } from '../lib/controlRoom/siteServiceStatus';
import {
  ALL_POCS_MAILING_LIST,
  allPocsMailUrl,
  audienceLabel,
  type Notice,
  type NoticeAudience,
} from '../lib/notices/audience';
import { isGoogleDriveLink } from '../lib/services/validateSubmission';
import { PageHeader } from './common/PageHeader';
import { Button } from './common/Button';
import { Reveal } from './common/Reveal';
import { usePersonas } from './common/usePersonas';

/**
 * The noticeboard: one place the whole company reads.
 *
 * Everyone opens it; only a Super Admin posts. Documents are Google Drive
 * links, never uploads, because a real deck is far past the 2 MB the app
 * stores and a link has no size. Who can see a notice is decided before it
 * reaches this screen (RLS against the API, `visibleNotices` in demo mode),
 * so nothing here filters by audience.
 */

interface NoticeboardProps {
  onBack?: () => void;
}

const when = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const Noticeboard: React.FC<NoticeboardProps> = ({ onBack }) => {
  const { notices, markNoticesRead, currentUser, siteMasterRows, warehouses } = useApp();
  const caps = useMemo(() => capabilitiesFor(currentUser), [currentUser]);
  const [composing, setComposing] = useState(false);

  const sites = useMemo(() => controlRoomSites(siteMasterRows, warehouses), [siteMasterRows, warehouses]);
  const siteName = (code: string) => sites.find((s) => s.id === code)?.name;

  // What was new when the board opened, kept for this visit. Opening the
  // board marks them read at once, which stops the tab flashing; without
  // this snapshot the "New" markers would vanish in the same instant, and
  // nobody could tell which notices had just arrived.
  const [arrived] = useState<Set<string>>(() => new Set(notices.filter((n) => !n.read).map((n) => n.id)));

  const marked = useRef(false);
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    markNoticesRead([...arrived]);
  }, [arrived, markNoticesRead]);

  // A notice posted by someone else while this screen is open is read too:
  // they are looking at it.
  useEffect(() => {
    const fresh = notices.filter((n) => !n.read).map((n) => n.id);
    if (fresh.length) markNoticesRead(fresh);
  }, [notices, markNoticesRead]);

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-12">
      <PageHeader
        title="Noticeboard"
        description="SOPs, decks and messages from the Admin team."
        icon={Megaphone}
        onBack={onBack}
        backLabel="Back"
        actions={
          caps.canManageMasterData && !composing ? (
            <Button variant="primary" icon={<Plus className="w-3.5 h-3.5" />} onClick={() => setComposing(true)}>
              New notice
            </Button>
          ) : undefined
        }
      />

      {composing && <Composer onDone={() => setComposing(false)} sites={sites} />}

      {notices.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-(--r-card) p-10 text-center">
          <Megaphone className="w-7 h-7 mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">Nothing posted yet</p>
          <p className="mt-1 text-xs text-slate-500">
            {caps.canManageMasterData
              ? 'Post an SOP, a deck or a message for everyone, one site, or one person.'
              : 'When the Admin team posts something for you, it appears here.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notices.map((n, i) => (
            <Reveal as="li" key={n.id} index={i}>
              <NoticeCard
                notice={n}
                isNew={arrived.has(n.id)}
                siteName={siteName}
                showAudience={caps.canManageMasterData}
                canMail={caps.canManageMasterData}
              />
            </Reveal>
          ))}
        </ul>
      )}
    </div>
  );
};

const NoticeCard: React.FC<{
  notice: Notice;
  isNew: boolean;
  siteName: (code: string) => string | undefined;
  showAudience: boolean;
  /** The poster, who may send an Everyone notice out on the mailing list. */
  canMail: boolean;
}> = ({ notice, isNew, siteName, showAudience, canMail }) => {
  const mailUrl = canMail ? allPocsMailUrl(notice) : null;
  return (
  <article
    className={`bg-white border rounded-(--r-card) p-4 sm:p-5 shadow-xs ${
      isNew ? 'border-(--color-due) ring-1 ring-(--color-due)/30' : 'border-slate-200'
    }`}
  >
    <div className="flex items-start justify-between gap-3">
      <h2 className="text-sm font-semibold text-slate-900 min-w-0">{notice.title}</h2>
      {isNew && (
        <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-(--color-due-tint) text-(--color-ink)">
          New
        </span>
      )}
    </div>

    <p className="mt-1 text-[11px] text-slate-500">
      {notice.postedByName || notice.postedBy}
      {notice.postedAt && <> · {when(notice.postedAt)}</>}
      {/* The addressee is the poster's business. A POC reading a notice
          sent to them alone does not need telling it is private. */}
      {showAudience && <> · to {audienceLabel(notice, siteName)}</>}
    </p>

    {notice.body && <p className="mt-3 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{notice.body}</p>}

    {(notice.linkUrl || mailUrl) && (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {notice.linkUrl && (
          <a
            href={notice.linkUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition"
          >
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            Open document
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>
        )}
        {/* Only an Everyone notice, only for the poster. allPocsMailUrl
            returns null for anything else, so this cannot broadcast a
            private message even if the condition here were wrong. */}
        {mailUrl && (
          <a
            href={mailUrl}
            target="_blank"
            rel="noreferrer"
            title={`Opens Gmail to ${ALL_POCS_MAILING_LIST}, which reaches every POC`}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition"
          >
            <Mail className="w-3.5 h-3.5 text-slate-500" />
            Email all POCs
          </a>
        )}
      </div>
    )}
  </article>
  );
};

const AUDIENCES: { value: NoticeAudience; label: string; hint: string }[] = [
  { value: 'ALL', label: 'Everyone', hint: 'Every person in the app' },
  { value: 'SITE', label: 'One site', hint: 'Everyone who holds that site' },
  { value: 'PERSON', label: 'One person', hint: 'Only them. Nobody else can see it' },
];

const INPUT =
  'w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-slate-400';

const Composer: React.FC<{ onDone: () => void; sites: ReturnType<typeof controlRoomSites> }> = ({ onDone, sites }) => {
  const { postNotice, notify } = useApp();
  const personas = usePersonas();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [audience, setAudience] = useState<NoticeAudience>('ALL');
  const [siteCode, setSiteCode] = useState('');
  const [personEmail, setPersonEmail] = useState('');
  const [personQuery, setPersonQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const people = useMemo(() => {
    const q = personQuery.trim().toLowerCase();
    const named = personas.filter((p) => p.email);
    return q ? named.filter((p) => `${p.fullName} ${p.email}`.toLowerCase().includes(q)) : named;
  }, [personas, personQuery]);

  const linkBad = linkUrl.trim() !== '' && !isGoogleDriveLink(linkUrl);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError('Give the notice a title.');
    if (linkBad) return setError('Share the document as a Google Drive or Docs link.');
    if (audience === 'SITE' && !siteCode) return setError('Choose the site this notice is for.');
    if (audience === 'PERSON' && !personEmail) return setError('Choose the person this notice is for.');

    const input: NoticeInput = {
      title,
      body,
      linkUrl: linkUrl.trim() || undefined,
      audience,
      siteCode: audience === 'SITE' ? siteCode : undefined,
      personEmail: audience === 'PERSON' ? personEmail : undefined,
    };
    setSaving(true);
    const res = await postNotice(input);
    setSaving(false);
    if (!res.ok) return setError(res.message);
    // An Everyone notice can also go out on the all-POCs mailing list. The
    // new notice sits at the top of the list with that button on it; only
    // Everyone notices ever get one.
    notify(
      'success',
      'Notice posted',
      audience === 'ALL' ? `${title}. Use "Email all POCs" on it to send it to every POC too.` : title,
    );
    onDone();
  };

  return (
    <form onSubmit={submit} className="bg-white border border-slate-200 rounded-(--r-card) p-4 sm:p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">New notice</h2>
        <button
          type="button"
          onClick={onDone}
          aria-label="Close"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="nb-title" className="text-xs font-semibold text-slate-700">
          Title
        </label>
        <input id="nb-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={INPUT} placeholder="Cold chain SOP, version 4" />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="nb-body" className="text-xs font-semibold text-slate-700">
          Message <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <textarea id="nb-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} className={INPUT} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="nb-link" className="text-xs font-semibold text-slate-700">
          Document <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <input
          id="nb-link"
          type="url"
          inputMode="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          className={`${INPUT} ${linkBad ? 'border-(--color-missing)' : ''}`}
          placeholder="https://docs.google.com/presentation/..."
        />
        <p className={`text-[11px] ${linkBad ? 'text-(--color-missing)' : 'text-slate-500'}`}>
          {linkBad
            ? 'That is not a Google Drive or Docs link.'
            : 'A Drive or Docs link to the PPT, PDF, Doc or Sheet. Any size: the file stays in Drive.'}
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-slate-700">Send to</legend>
        <div className="grid grid-cols-1 xs:grid-cols-3 gap-2" role="radiogroup">
          {AUDIENCES.map((a) => {
            const picked = audience === a.value;
            return (
              <button
                key={a.value}
                type="button"
                role="radio"
                aria-checked={picked}
                onClick={() => setAudience(a.value)}
                className={`text-left p-3 rounded-xl border transition cursor-pointer ${
                  picked ? 'border-(--color-ink) bg-slate-50' : 'border-slate-200 hover:border-slate-400'
                }`}
              >
                <span className="block text-sm font-semibold text-slate-900">{a.label}</span>
                <span className="block mt-0.5 text-[11px] text-slate-500">{a.hint}</span>
              </button>
            );
          })}
        </div>

        {audience === 'SITE' && (
          <select value={siteCode} onChange={(e) => setSiteCode(e.target.value)} aria-label="Site" className={INPUT}>
            <option value="">Choose a site</option>
            {[...sites].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        {audience === 'PERSON' && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={personQuery}
                onChange={(e) => setPersonQuery(e.target.value)}
                placeholder="Find a person"
                aria-label="Find a person"
                className={`${INPUT} pl-8`}
              />
            </div>
            <select value={personEmail} onChange={(e) => setPersonEmail(e.target.value)} aria-label="Person" className={INPUT}>
              <option value="">{people.length ? `Choose from ${people.length}` : 'Nobody matches'}</option>
              {people.map((p) => (
                <option key={`${p.id}-${p.email}`} value={p.email}>
                  {p.fullName} ({p.email})
                </option>
              ))}
            </select>
          </div>
        )}
      </fieldset>

      {error && <p className="text-xs text-(--color-missing)">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving} icon={<Send className="w-3.5 h-3.5" />}>
          Post notice
        </Button>
      </div>
    </form>
  );
};
