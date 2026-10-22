import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import SiteHeader from '../../components/SiteHeader.jsx';
import SportIcon from '../../components/SportIcon.jsx';
import StaffShell from '../staff/StaffShell.jsx';
import DataList from '../manage/DataList.jsx';
import Hero from '../home/Hero.jsx';
import SportsFilters from '../home/SportsFilters.jsx';
import LiveMatches from '../matches/LiveMatches.jsx';
import Tournaments from '../tournaments/Tournaments.jsx';
import { sampleMatches } from '../matches/sampleMatches.js';
import { sampleTournaments } from '../tournaments/sampleTournaments.js';
import SportMatchDialog from '../sports/SportMatchDialog.jsx';
import TournamentsView from '../tournaments/TournamentsView.jsx';
import TournamentView from '../tournaments/TournamentView.jsx';
import TournamentSportView from '../tournaments/TournamentSportView.jsx';
import SignInChoiceView from '../auth/SignInChoiceView.jsx';
import AdminHomeView from '../admin/AdminHomeView.jsx';
import AllTournamentsView from '../admin/AllTournamentsView.jsx';
import StaffListView from '../admin/StaffListView.jsx';
import InviteStaffView from '../admin/InviteStaffView.jsx';
import StaffMemberView from '../admin/StaffMemberView.jsx';
import PendingInvitationsView from '../admin/PendingInvitationsView.jsx';
import { findScreen, GROUPS, NAV_MAPS, STATE_LABELS } from './previewScreens.js';
import { PREVIEW_DATA } from './previewData.js';
import '../home/HomePage.css';
import '../sports/SportPage.css';
import '../manage/manage.css';

/** Home with its Display_Fixtures and no live feed, so the preview opens no socket. Tiles filter in place. */
function HomePreview() {
  const [sport, setSport] = useState('all');
  const matches = sport === 'all' ? sampleMatches : sampleMatches.filter(match => match.sport === sport);
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <SportsFilters selectedSport={sport} onSelect={setSport} />
        <LiveMatches matches={matches} selectedSport={sport} />
        <Tournaments tournaments={sampleTournaments} />
      </main>
    </>
  );
}

/** The Sport page frame with its match detail dialog open; "Open match details" opens it again after Close. */
function MatchDialogPreview({ sport, scoring, match }) {
  const [open, setOpen] = useState(match);
  const theme = {
    '--match-background': `url('/assets/${sport.id}-background.webp')`,
    '--match-background-phone': `url('/assets/${sport.id}-background-640.webp')`,
    '--sport-color': sport.color,
  };
  return (
    <>
      <SiteHeader />
      <main className="sport-page" style={theme}>
        <header className="sport-section sport-title"><h1><SportIcon sport={sport.id} />{sport.label}</h1></header>
        <p className="sport-section"><button type="button" className="date-chip" onClick={() => setOpen(match)}>Open match details</button></p>
        <SportMatchDialog sport={sport} scoring={scoring} match={open} onClose={() => setOpen(null)} />
      </main>
    </>
  );
}

// The real View of each preview key. Public Views take `status`; staff Views take `state` and `role`.
const VIEWS = {
  home: HomePreview, tournaments: TournamentsView, tournament: TournamentView, 'tournament-sport': TournamentSportView,
  'sport-page': TournamentSportView, 'match-dialog': MatchDialogPreview, 'sign-in-choice': SignInChoiceView,
  'admin-home': AdminHomeView, 'all-tournaments': AllTournamentsView, 'staff-list': StaffListView, 'invite-staff': InviteStaffView,
  'staff-member': StaffMemberView, 'pending-invitations': PendingInvitationsView,
};

// Handlers a container would wire to the API. In the preview they do nothing, so no request is sent (Req 1.7).
const noop = () => {};
const NO_OPS = Object.fromEntries(['onRetry', 'onSubmit', 'onAdd', 'onAddTeam', 'onAddMatch', 'onAddManager', 'onEdit', 'onSave',
  'onCancelEdit', 'onSaveFormat', 'onFinish', 'onFilter', 'onFilterChange', 'onChoose', 'onLoadMore']
  .map(name => [name, noop]));

/** One View with fake data in one state. Only the open confirmation dialog is local, so its layout can be reviewed. */
function ScreenPreview({ screen, state, role }) {
  const [confirm, setConfirm] = useState(null);
  const close = () => setConfirm(null);
  const { props, data, empty, emptyState = 'ready' } = PREVIEW_DATA[screen.key];
  const View = VIEWS[screen.key];
  // Public Views set no title; App.jsx leaves /preview titles to the screen.
  useEffect(() => { if (!screen.role) document.title = `${screen.title} | Thaparlympics`; }, [screen]);
  const viewState = state === 'empty' ? emptyState : state;
  return (
    <View {...NO_OPS} confirm={confirm} onRequest={setConfirm} onRequestDelete={setConfirm}
      onConfirm={close} onCancel={close} role={role} {...{ [screen.role ? 'state' : 'status']: viewState }}
      {...props} {...(state === 'ready' ? data : state === 'empty' ? empty : null)} />
  );
}

/** Preview controls above the screen: back to the index and one link per state. */
function PreviewBar({ screen, state, role }) {
  const link = value => `/preview/${screen.key}?state=${value}${role !== screen.role ? `&role=${role}` : ''}`;
  return (
    <div className="staff">
      <nav className="staff-nav" aria-label="Layout preview">
        <div className="staff-container staff-nav-row">
          <ul>
            <li><Link to="/preview">All layouts</Link></li>
            {screen.states.map(value => (
              <li key={value}><Link to={link(value)} aria-current={value === state ? 'page' : undefined}>{STATE_LABELS[value]}</Link></li>
            ))}
          </ul>
          <p className="staff-role">Layout preview with fake data</p>
        </div>
      </nav>
    </div>
  );
}

const previewLink = (screen, role) => `/preview/${screen.key}${role && screen.role === 'TOURNAMENT_MANAGER' ? `?role=${role}` : ''}`;

/** One branch of a navigation map: the screen, then the screens whose Back link leads to it. */
function MapNode({ map, node }) {
  const screen = findScreen(node);
  const children = map.links.filter(([, parent]) => parent === node).map(([child]) => child);
  return <>
    {screen?.states.length ? <Link className="button-text" to={previewLink(screen, map.previewRole)}>{screen.title}</Link> : <span>{screen?.title ?? node}</span>}
    {children.length > 0 && <ul>{children.map(child => <li key={child}><MapNode map={map} node={child} /></li>)}</ul>}
  </>;
}

const list = items => <ul className="plain-list">{items.map(item => <li key={item}>{item}</li>)}</ul>;
const COLUMNS = [
  { label: 'Screen', cell: screen => <>
    {screen.states.length ? <Link className="button-text" to={`/preview/${screen.key}`}>{screen.title}</Link> : <strong>{screen.title}</strong>}
    <span className="data-sub">{screen.roleName}{screen.layout && ` · ${screen.layout}`}</span>
    <span className="data-sub">{screen.purpose}</span>
  </> },
  { label: 'Primary action', cell: screen => screen.primary },
  { label: 'Entry points', cell: screen => list(screen.entry) },
  { label: 'Exit points', cell: screen => list(screen.exit) },
  { label: 'States', cell: screen => (screen.capturedBySpecs
    ? <span className="data-sub">Existing screen. Its captures come from the operator browser tests.</span>
    : <div className="row-actions">{screen.states.map(value => (
        <Link key={value} className="button-text" to={`/preview/${screen.key}?state=${value}`}>{STATE_LABELS[value]}<span className="sr-only"> {screen.title}</span></Link>
      ))}</div>) },
];

/** The list of layouts with their metadata, and one navigation map per role (Req 1.1 to 1.4). */
function Index() {
  return (
    <StaffShell title="Layout preview">
      <p>Stage 1 layouts of every screen for review. Each screen uses fake data and sends nothing to the server, so buttons do not save.</p>
      <p className="staff-meta">Screens that already use the API are not listed here; the navigation maps still show them as text. Open a state to see a screen loading, empty, failed or without access.</p>
      {GROUPS.map((group, i) => {
        const rows = group.screens.flatMap(screen => (screen.steps ?? [screen]).map(row => ({ ...row, roleName: group.roleName, layout: screen.steps && screen.title })));
        return (
          <section className="staff-section" key={group.title} aria-labelledby={`preview-group-${i}`}>
            <h2 id={`preview-group-${i}`}>{group.title}</h2>
            <DataList label={group.title} rows={rows} rowKey={row => row.key} columns={COLUMNS} />
          </section>
        );
      })}
      <section className="staff-section" aria-labelledby="preview-maps">
        <h2 id="preview-maps">Navigation maps</h2>
        <p>Each role starts at its start screen. A screen sits under the screen its Back link opens.</p>
        {NAV_MAPS.map(map => (
          <div className="list-group" key={map.roleName}>
            <h3>{map.roleName}</h3>
            <ul className="plain-list"><li><MapNode map={map} node={map.start} /></li></ul>
          </div>
        ))}
      </section>
    </StaffShell>
  );
}

/**
 * Stage 1 layout preview (design "Stage 1 layout preview"). `/preview` lists every layout; `/preview/:screen?state=`
 * renders the real View with fake data and no container, so no API request leaves the page. `role=SUPER_ADMIN` shows
 * a Tournament Manager screen with the Super Admin navigation. Registered only in local and staging builds.
 */
export default function PreviewIndex() {
  const { screen: key } = useParams();
  const [search] = useSearchParams();
  if (!key) return <Index />;
  const screen = findScreen(key);
  if (!screen?.states.length) {
    return <main className="not-found"><h1>Page not found</h1><Link to="/preview">All layouts</Link></main>;
  }
  const requested = search.get('state');
  const state = screen.states.includes(requested) ? requested : 'ready';
  const role = screen.role === 'TOURNAMENT_MANAGER' && search.get('role') === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : screen.role;
  return (
    <>
      <PreviewBar screen={screen} state={state} role={role} />
      <ScreenPreview key={`${key}-${state}-${role}`} screen={screen} state={state} role={role} />
    </>
  );
}
