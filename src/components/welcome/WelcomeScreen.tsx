import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, BookOpen, Building2, Check, ChevronRight, ExternalLink, HelpCircle, Mail, MapPin, Phone, Warehouse, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { appWarehouseIdFor, controlRoomSites, type ControlRoomSite } from '../../lib/controlRoom/siteServiceStatus';
import { WELCOME_ACCENT, welcomeScene } from '../../lib/welcome/scene';
import {
  destinationFor,
  firstName,
  gmailCompose,
  helpContactFor,
  isPinnedRole,
  ownSites,
  problemRecipients,
  serviceAdminLine,
  sitePlace,
  welcomeDate,
  type SitePlace,
} from '../../lib/welcome/welcome';

/**
 * The first screen after sign-in, once per session: a greeting by name, the
 * warehouse campus, and one button to the person's home screen. A POC who
 * looks after more than one site picks which one they are filing for first.
 * "Need help?" opens who to call, the SOPs, and a way to report a problem.
 */

/** Tailwind's lg: the greeting and the campus side by side. */
const WIDE = '(min-width: 1024px)';

const ROLE_NAME: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  SERVICE_ADMIN: 'Service Admin',
  WAREHOUSE_ADMIN: 'Site admin',
  SITE_POC: 'Site POC',
};

/** The campus, for one layout. The id prefix keeps two copies' filters apart. */
const Scene: React.FC<{ phone?: boolean; className?: string }> = ({ phone, className = '' }) => {
  const prefix = `ws${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const scene = useMemo(() => (phone ? welcomeScene(1.8, [-440, -380, 880, 670]) : welcomeScene(1)), [phone]);
  const markup = useMemo(() => scene.markup.replaceAll('IDP', prefix), [scene, prefix]);
  return (
    <svg
      className={`ws-scene ${className}`}
      viewBox={scene.viewBox}
      role="img"
      aria-label="A warehouse campus: trucks at the dock, a forklift at work, and the Daily Site Report, EB and DG, Diesel and Fire Pump checks, each done"
      style={{ aspectRatio: String(scene.aspect) }}
      // Static markup built by lib/welcome/scene from fixed geometry; no user text.
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
};

export const WelcomeScreen: React.FC<{
  /** Leaves the welcome for a screen; the app marks it seen for this session. */
  onContinue: (view: string) => void;
}> = ({ onContinue }) => {
  const {
    currentUser,
    currentDate,
    siteMasterRows,
    warehouses,
    pocMasterRows,
    users,
    serviceRegistryRows,
    setSelectedWarehouseId,
  } = useApp();

  const pinned = isPinnedRole(currentUser.role);
  const sites = useMemo(() => controlRoomSites(siteMasterRows, warehouses), [siteMasterRows, warehouses]);
  const mySites = useMemo(() => (pinned ? ownSites(currentUser, sites) : []), [pinned, currentUser, sites]);
  const needsPick = pinned && mySites.length > 1;
  const [picked, setPicked] = useState<ControlRoomSite | null>(null);

  const dest = destinationFor(currentUser.role);
  const contact = useMemo(() => helpContactFor(currentUser, mySites, pocMasterRows, users), [currentUser, mySites, pocMasterRows, users]);
  const reportTo = useMemo(() => problemRecipients(currentUser, pocMasterRows, users), [currentUser, pocMasterRows, users]);

  // One layout at a time, so there is one scene and one help dialog.
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(WIDE).matches === true);
  useEffect(() => {
    const mq = window.matchMedia?.(WIDE);
    if (!mq) return;
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const [helpOpen, setHelpOpen] = useState(false);
  const helpButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!helpOpen) return;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHelpOpen(false);
        helpButton.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen]);

  const go = (view = dest.view) => {
    const site = needsPick ? picked : mySites[0];
    if (needsPick && !picked && view === dest.view) return;
    if (pinned && site) setSelectedWarehouseId(appWarehouseIdFor(site, warehouses));
    onContinue(view);
  };

  // Under the name: a Service Admin's services, a POC's WH code with the
  // address behind the pin, or how many sites they choose between.
  const places = useMemo(() => mySites.map((s) => sitePlace(s, siteMasterRows, warehouses)), [mySites, siteMasterRows, warehouses]);
  const serviceLine = currentUser.role === 'SERVICE_ADMIN' ? serviceAdminLine(currentUser, serviceRegistryRows) : null;

  const reportBody = [
    'Hi,',
    '',
    'Something went wrong in WarehouseOS.',
    '',
    'What happened:',
    '',
    '',
    `Name: ${currentUser.fullName}`,
    `Role: ${ROLE_NAME[currentUser.role] ?? currentUser.role}`,
    ...(mySites.length ? [`Site: ${mySites.map((s) => s.name).join(', ')}`] : []),
    `Date: ${currentDate}`,
  ].join('\n');

  const help = (
    <>
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-xl font-semibold tracking-tight font-display">Need help?</h2>
        <button ref={closeButton} type="button" className="ws-icon-btn" onClick={() => { setHelpOpen(false); helpButton.current?.focus(); }} aria-label="Close help">
          <X className="w-4.5 h-4.5" />
        </button>
      </div>
      {contact && (
        <div className="ws-contact">
          <div className="flex items-center gap-3">
            <span className="ws-avatar">{contact.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</span>
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[15px] font-semibold truncate">{contact.name}</span>
              <span className="text-[13px] text-[#56627a]">{contact.relation}</span>
            </span>
          </div>
          {(contact.phone || contact.email) && (
            <div className="grid grid-cols-2 gap-2">
              {contact.phone && (
                <a className="ws-mini-btn" href={`tel:${contact.phone.replace(/\s+/g, '')}`}>
                  <Phone className="w-4 h-4" /> Call
                </a>
              )}
              {contact.email && (
                <a className="ws-mini-btn" href={gmailCompose([contact.email], 'WarehouseOS: need help', '')} target="_blank" rel="noreferrer">
                  <Mail className="w-4 h-4" /> Email
                </a>
              )}
            </div>
          )}
        </div>
      )}
      <nav aria-label="Help topics" className="flex flex-col">
        <button type="button" className="ws-help-row" onClick={() => go('noticeboard')}>
          <span className="ws-hr-i"><BookOpen className="w-4.5 h-4.5" /></span>
          <span className="grow text-left">
            <span className="block text-sm font-semibold">SOPs and guides</span>
            <span className="block text-[12.5px] text-[#56627a]">On the Noticeboard</span>
          </span>
          <ChevronRight className="w-4.5 h-4.5 text-[#56627a]" />
        </button>
        {reportTo.length > 0 && (
          <a className="ws-help-row" href={gmailCompose(reportTo, 'WarehouseOS: problem report', reportBody)} target="_blank" rel="noreferrer">
            <span className="ws-hr-i"><AlertCircle className="w-4.5 h-4.5" /></span>
            <span className="grow">
              <span className="block text-sm font-semibold">Report a problem</span>
              <span className="block text-[12.5px] text-[#56627a]">Tell the app team what went wrong</span>
            </span>
            <ChevronRight className="w-4.5 h-4.5 text-[#56627a]" />
          </a>
        )}
      </nav>
    </>
  );

  const greeting = (
    <>
      <div className="flex flex-col gap-2.5 lg:gap-4">
        <span className="ws-rise font-mono text-[11px] lg:text-[13px] font-medium tracking-[0.12em] uppercase text-[#56627a]">{welcomeDate(currentDate)}</span>
        <h1 className="ws-rise ws-r2 m-0 font-semibold text-[40px] leading-[1.04] tracking-[-0.035em] lg:text-[68px] lg:leading-[1.02] lg:tracking-[-0.04em] font-display">
          Welcome,
          <span className="block text-(--acc)">{firstName(currentUser.fullName)}</span>
        </h1>
        {places.length === 1 && <PlacePill place={places[0]} />}
        {needsPick && <p className="ws-rise ws-r3 m-0 text-[15px] lg:text-lg text-[#4a566e]">You look after {mySites.length} sites</p>}
        {pinned && mySites.length === 0 && <p className="ws-rise ws-r3 m-0 text-[15px] lg:text-lg text-[#4a566e]">No site is assigned to you yet</p>}
        {serviceLine && <p className="ws-rise ws-r3 m-0 text-[15px] lg:text-lg text-[#4a566e]">{serviceLine}</p>}
      </div>

      {needsPick && (
        <fieldset className="ws-rise ws-r4 m-0 p-0 border-0 flex flex-col gap-2 lg:gap-2.5">
          <legend className="mb-2 text-[13px] lg:text-sm font-semibold text-[#3f4b63]">Which site are you filing for?</legend>
          {mySites.map((s, n) => (
            <button
              key={s.id}
              type="button"
              className={`ws-site ${picked?.id === s.id ? 'ws-picked' : ''}`}
              aria-pressed={picked?.id === s.id}
              onClick={() => setPicked(s)}
            >
              <span className="ws-site-i"><Warehouse className="w-5 h-5" /></span>
              <span className="min-w-0 text-left">
                <span className="block text-[15px] font-semibold truncate">{places[n].whCode}</span>
                <span className="block text-[12.5px] text-[#56627a] truncate">
                  {[places[n].whCode !== s.name ? s.name : '', s.city].filter(Boolean).join(' · ') || s.id}
                </span>
              </span>
              <span className="ws-radio"><Check className="w-3.25 h-3.25" strokeWidth={3} /></span>
            </button>
          ))}
        </fieldset>
      )}

      <button type="button" className="ws-go ws-rise ws-r5" onClick={() => go()} disabled={needsPick && !picked}>
        {needsPick && !picked ? 'Choose a site to continue' : dest.label}
        {!(needsPick && !picked) && <ArrowRight className="w-4.5 h-4.5" />}
      </button>
    </>
  );

  return (
    <div
      className={`ws-welcome ws-live relative min-h-dvh overflow-hidden bg-[#eef2f8] text-[#0f1b2d] flex flex-col ${helpOpen ? 'ws-help-open' : ''}`}
      style={{ ['--acc' as string]: WELCOME_ACCENT }}
    >
      {/* One frame for the header, the greeting and the campus, so on any
          width their edges line up: the greeting under the logo, the campus
          ending under Need help. */}
      <header className="ws-frame relative z-20 flex items-center justify-between pt-5 lg:pt-10">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 lg:w-10 lg:h-10 rounded-xl bg-[#0f1b2d] text-white grid place-items-center">
            <Building2 className="w-5 h-5" />
          </span>
          <span className="text-lg lg:text-xl font-bold tracking-tight font-display">WarehouseOS</span>
        </div>
        <div className="relative">
          <button ref={helpButton} type="button" className="ws-help-btn" onClick={() => setHelpOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={helpOpen}>
            <HelpCircle className="w-4.5 h-4.5" />
            <span className="hidden sm:inline">Need help?</span>
            <span className="sm:hidden">Help</span>
          </button>
          {helpOpen && wide && (
            <div role="dialog" aria-label="Need help" className="ws-help-pop">
              {help}
            </div>
          )}
        </div>
      </header>

      {wide ? (
        <div className="ws-frame ws-stage flex-1">
          <main className="relative z-10 flex flex-col items-start gap-9">{greeting}</main>
          <Scene className="block w-full max-w-260 h-auto justify-self-end" />
        </div>
      ) : (
        <>
          <div className="flex-1 flex items-center min-h-0 overflow-hidden">
            <Scene phone className="block w-[120%] max-w-none ml-[-10%] sm:w-full sm:max-w-160 sm:mx-auto h-auto" />
          </div>
          <main className="ws-frame relative z-10 flex flex-col gap-6 pb-7">{greeting}</main>
        </>
      )}

      {/* Help on a phone: a sheet from the bottom. */}
      {helpOpen && !wide && (
        <div className="fixed inset-0 z-30">
          <button type="button" className="ws-scrim" aria-label="Close help" onClick={() => setHelpOpen(false)} />
          <div role="dialog" aria-label="Need help" className="ws-help-sheet">
            <span className="self-center w-10 h-1 rounded-full bg-[#d5dde9]" aria-hidden />
            {help}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * The site's WH code, and a pin that shows where it is: the full address and
 * a map link, on hover or keyboard focus, or a tap on a phone.
 */
const PlacePill: React.FC<{ place: SitePlace }> = ({ place }) => {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const cardId = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={box} className={`ws-place ws-rise ws-r3 ${open ? 'ws-open' : ''}`}>
      <span className="ws-wh">{place.whCode}</span>
      <button
        type="button"
        className="ws-pin"
        aria-label={`Where ${place.name} is`}
        aria-expanded={open}
        aria-controls={cardId}
        onClick={() => setOpen((v) => !v)}
      >
        <MapPin className="w-4 h-4" />
      </button>
      <div id={cardId} className="ws-place-card">
        <span className="flex items-start gap-2.5">
          <span className="ws-place-i"><MapPin className="w-4 h-4" /></span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[#0f1b2d]">{place.name}</span>
            <span className="block mt-1 text-[13px] leading-relaxed text-[#4a566e]">{place.address || 'No address in Master Data yet.'}</span>
            <span className="block mt-2 font-mono text-[11px] tracking-wide text-[#56627a]">
              {place.siteCode}{place.whCode !== place.name ? ` · ${place.whCode}` : ''}
            </span>
          </span>
        </span>
        {place.mapUrl && (
          <a className="ws-map-link" href={place.mapUrl} target="_blank" rel="noreferrer">
            Open in Maps <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
};
