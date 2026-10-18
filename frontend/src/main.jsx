import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";

const DEFAULT_SEASON = "";
// EuroLeague shot coordinates use about 1,500 units across and 1,400 from baseline to midcourt.
const COURT_X_MIN = -750;
const COURT_X_MAX = 750;
const COURT_Y_BASELINE = 0;
const COURT_Y_HALF = 1400;

/**
 * @typedef {Object} PlayerPerformance
 * @property {number} season
 * @property {string} player_id
 * @property {string | null} player_name
 * @property {string | null} team_code
 * @property {string | null} team_name
 * @property {number | null} games_played
 * @property {number | null} points_per_game
 * @property {number | null} rebounds_per_game
 * @property {number | null} assists_per_game
 * @property {number | null} field_goal_percentage
 * @property {number | null} three_point_percentage
 * @property {number | null} effective_field_goal_percentage
 */

function readSavedSeason() {
  const storedSeason = localStorage.getItem("courtvision-season") ?? DEFAULT_SEASON;
  return /^\d{4}$/.test(storedSeason) ? storedSeason : DEFAULT_SEASON;
}

function parseRoute() {
  const [path, query = ""] = window.location.hash.replace(/^#\/?/, "").split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query);
  const season = params.has("season") ? params.get("season") : null;

  if (parts.length === 2 && ["teams", "games", "players"].includes(parts[0])) {
    return { type: parts[0], id: parts[1], season };
  }
  if (parts[0] === "games") return { type: "games", id: null, season };
  if (parts[0] === "players") return { type: "players", id: null, season };
  return { type: "overview", id: null, season };
}

function makeRouteUrl(type, id, season) {
  const path = type === "overview" ? "" : id == null ? type : `${type}/${encodeURIComponent(id)}`;
  const query = season ? `?season=${encodeURIComponent(season)}` : "";
  return `#/${path}${query}`;
}

async function api(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body.detail) message = body.detail;
    } catch {
      // Keep the status message if the response body is not JSON.
    }
    throw new Error(message);
  }
  return response.json();
}

function useApiData(loader, dependencies) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reloadVersion, setReloadVersion] = useState(0);
  const reload = useCallback(() => setReloadVersion((version) => version + 1), []);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);

    loader()
      .then((result) => {
        if (current) setData(result);
      })
      .catch((loadError) => {
        if (current) setError(loadError);
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
    };
  }, [...dependencies, reloadVersion]);

  return { data, error, loading, reload };
}

function number(value, digits = 0) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(parsed);
}

function percent(value) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${(parsed * 100).toFixed(1)}%` : "—";
}

function seasonQuery(season) {
  return season ? `?season=${encodeURIComponent(season)}` : "";
}

function shotPlayerId(playerId) {
  return /^[Pp]/.test(playerId) ? playerId : `P${playerId}`;
}

function Heading({ eyebrow, title, description, action }) {
  return (
    <section className="page-heading">
      <div>
        <div className="eyebrow"><i className="live-dot" />{eyebrow}</div>
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action}
    </section>
  );
}

function Panel({ title, children, meta, action }) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2 className="panel-title">{title}</h2>
        {action || (meta && <span className="panel-meta">{meta}</span>)}
      </header>
      {children}
    </section>
  );
}

function ErrorState({ error, onRetry }) {
  return (
    <div className="error-state" role="alert">
      <strong>Couldn’t load this data</strong>
      <span>{error?.message || "The analytics API is unavailable."}</span>
      <button className="retry-button" type="button" onClick={onRetry}>Try again</button>
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">◌</span>
      <span>{children}</span>
    </div>
  );
}

function LoadingState({ children = "Loading data…" }) {
  return (
    <div className="loading-state" role="status">
      <div className="skeleton" style={{ width: 180 }} />
      <span>{children}</span>
    </div>
  );
}

function StatCard({ label, value, note, accent = false }) {
  return (
    <article className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value${accent ? " accent-value" : ""}`}>{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </article>
  );
}

function DetailStats({ items }) {
  return (
    <div className="detail-grid">
      {items.map(([label, value, accent]) => (
        <div className="detail-stat" key={label}>
          <div className="stat-label">{label}</div>
          <div className={`stat-value${accent ? " accent-value" : ""}`}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function StandingsTable({ teams, season }) {
  if (!teams.length) return <EmptyState>No standings are available for this season.</EmptyState>;
  return (
    <div className="table-scroll">
      <table>
        <thead><tr><th>#</th><th>Club</th><th>W–L</th><th>Win %</th><th>PF</th><th>PA</th><th>+/-</th></tr></thead>
        <tbody>
          {teams.map((team, index) => {
            const difference = Number(team.point_difference) || 0;
            return (
              <tr key={team.team_code}>
                <td className="rank">{String(index + 1).padStart(2, "0")}</td>
                <td>
                  <a className="team-cell team-link" href={makeRouteUrl("teams", team.team_code, season)}>
                    <span className="team-badge">{(team.team_code || "?").slice(0, 3)}</span>
                    {team.team_name}
                  </a>
                </td>
                <td className="record">{number(team.wins)}–{number(team.losses)}</td>
                <td>{team.games_played ? percent(team.wins / team.games_played) : "—"}</td>
                <td>{number(team.points_for)}</td>
                <td>{number(team.points_against)}</td>
                <td className={difference >= 0 ? "positive" : "negative"}>{difference > 0 ? "+" : ""}{number(difference)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PlayerTable({ players, season, compact = false }) {
  if (!players.length) return <EmptyState>No player stats are available for this season.</EmptyState>;
  return (
    <div className="table-scroll">
      <table>
        <thead><tr><th>Player ↗</th><th>Club</th><th>GP</th><th>PPG</th><th>RPG</th><th>APG</th><th>Val / G</th><th>FG%</th><th>3P%</th><th>eFG%</th></tr></thead>
        <tbody>
          {players.slice(0, compact ? 8 : 100).map((player) => (
            <tr key={player.player_id}>
              <td><a className="player-link" href={makeRouteUrl("players", player.player_id, season)}>{player.player_name || player.player_id}</a></td>
              <td><a className="team-link" href={makeRouteUrl("teams", player.team_code, season)}>{player.team_code || "—"}</a></td>
              <td>{number(player.games_played)}</td>
              <td className="positive">{number(player.points_per_game, 1)}</td>
              <td>{number(player.rebounds_per_game, 1)}</td>
              <td>{number(player.assists_per_game, 1)}</td>
              <td>{player.games_played ? number(Number(player.valuation) / Number(player.games_played), 1) : "—"}</td>
              <td>{percent(player.field_goal_percentage)}</td>
              <td>{percent(player.three_point_percentage)}</td>
              <td>{percent(player.effective_field_goal_percentage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentGames({ games, season }) {
  if (!games.length) return <EmptyState>No games are available for this season.</EmptyState>;
  const ordered = [...games].sort((a, b) => {
    const dateOrder = Date.parse(b.game_date || "") - Date.parse(a.game_date || "");
    return (Number.isFinite(dateOrder) && dateOrder !== 0 ? dateOrder : 0)
      || Number(b.game_code) - Number(a.game_code);
  }).slice(0, 7);

  return (
    <div className="game-list">
      {ordered.map((game) => {
        const homeWon = Number(game.home_score) > Number(game.away_score);
        const awayWon = Number(game.away_score) > Number(game.home_score);
        return (
          <a className="game-row" href={makeRouteUrl("games", game.game_code, season)} key={game.game_code}>
            <div className="game-teams">
              <span className="game-team"><span className="game-team-code">{game.home_team_code}</span><span className={homeWon ? "positive" : ""}>{game.home_team || "Home"}</span><span className={`game-score${homeWon ? " positive" : ""}`}>{game.home_score ?? "—"}</span></span>
              <span className="game-team"><span className="game-team-code">{game.away_team_code}</span><span className={awayWon ? "positive" : ""}>{game.away_team || "Away"}</span><span className={`game-score${awayWon ? " positive" : ""}`}>{game.away_score ?? "—"}</span></span>
            </div>
            <span><span className="game-result">{game.played ? "FINAL" : "UPCOMING"}</span><span className="game-date">{game.game_date || "Date TBC"} · #{game.game_code}</span></span>
          </a>
        );
      })}
    </div>
  );
}

function CourtChart({ shots }) {
  const points = shots.filter((shot) => shot.x_coordinate != null
    && shot.y_coordinate != null
    && Number.isFinite(Number(shot.x_coordinate))
    && Number.isFinite(Number(shot.y_coordinate))
    // The source uses (-1, -1) for shots without a location, including free throws.
    && !(Number(shot.x_coordinate) === -1 && Number(shot.y_coordinate) === -1));
  if (!points.length) {
    return <EmptyState>{shots.length ? "Shot coordinates are not available." : "No shot data is available for this selection."}</EmptyState>;
  }

  return (
    <div className="chart-wrap">
      <div className="shot-chart" role="img" aria-label={`Shot locations: ${points.length} plotted, ${shots.length - points.length} without coordinates. Made shots are green and missed shots are orange.`}>
        <svg className="court-lines" viewBox="0 0 100 100" aria-hidden="true">
          <path d="M2 98 H98 V2 H2 Z M2 98 H98 M8 98 V67 M92 98 V67 M8 67 A47 47 0 0 1 92 67 M34 98 V58 H66 V98 M38.5 58 A11.5 11.5 0 0 1 61.5 58" />
          <circle cx="50" cy="88" r="1.4" />
          <line x1="47.5" y1="88" x2="52.5" y2="88" />
        </svg>
        {points.map((shot) => {
          const x = 2 + ((Number(shot.x_coordinate) - COURT_X_MIN) / (COURT_X_MAX - COURT_X_MIN)) * 96;
          const y = 98 - ((Number(shot.y_coordinate) - COURT_Y_BASELINE) / (COURT_Y_HALF - COURT_Y_BASELINE)) * 96;
          const made = /(FGM|MD|DUNK|MADE)/i.test(shot.action_type || "");
          return <span className={`shot-point${made ? "" : " miss"}`} key={`${shot.game_code}-${shot.shot_index}`} style={{ left: `${x}%`, top: `${y}%` }} title={`${shot.action_type || "Shot"} · ${shot.game_clock || ""}`} />;
        })}
      </div>
      <div className="chart-legend"><span><i className="legend-dot" />Made</span><span><i className="legend-dot miss" />Missed</span><span className="chart-count">{points.length} PLOTS{shots.length > points.length ? ` · ${shots.length - points.length} WITHOUT LOCATION` : ""}</span></div>
    </div>
  );
}

const TEAM_SHOTS_PAGE_SIZE = 500;

function TeamShotChart({ teamCode, season }) {
  const [page, setPage] = useState(0);
  const query = seasonQuery(season);
  useEffect(() => setPage(0), [teamCode, season]);

  const { data, error, loading, reload } = useApiData(
    () => api(`/shots?${query ? `${query.slice(1)}&` : ""}team_code=${encodeURIComponent(teamCode)}&limit=${TEAM_SHOTS_PAGE_SIZE + 1}&offset=${page * TEAM_SHOTS_PAGE_SIZE}`),
    [teamCode, season, page],
  );
  const hasNext = (data?.length ?? 0) > TEAM_SHOTS_PAGE_SIZE;
  const shots = data?.slice(0, TEAM_SHOTS_PAGE_SIZE) ?? [];
  const firstShot = shots.length ? page * TEAM_SHOTS_PAGE_SIZE + 1 : 0;
  const lastShot = page * TEAM_SHOTS_PAGE_SIZE + shots.length;
  const range = shots.length
    ? `${number(firstShot)}–${number(lastShot)}${hasNext ? "+" : ""} SHOTS`
    : "0 SHOTS";

  return (
    <Panel title="Shot chart" meta={range}>
      {loading ? <LoadingState>Loading team shots…</LoadingState> : error ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          {(page > 0 || hasNext) && (
            <nav className="shot-pagination" aria-label="Team shot chart pages">
              <button type="button" disabled={page === 0 || loading} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button>
              <span aria-live="polite">Page {page + 1} · showing shots {firstShot}–{lastShot}{hasNext ? " (more available)" : ""}</span>
              <button type="button" disabled={!hasNext || loading} onClick={() => setPage((current) => current + 1)}>Next</button>
            </nav>
          )}
          <CourtChart shots={shots} />
        </>
      )}
    </Panel>
  );
}

function AppShell({ route, season, seasons, seasonsLoading, seasonsError, onRetrySeasons, onSeasonChange, children }) {
  const seasonOptions = seasons ?? [];
  const hasSelectedSeason = seasonOptions.some((availableSeason) => String(availableSeason) === season);
  const unavailableSeason = season && !hasSelectedSeason && !seasonsLoading && !seasonsError;
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#/" aria-label="Courtvision home">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span className="brand-copy"><span className="brand-name">COURTVISION</span><span className="brand-subtitle">EuroLeague analytics</span></span>
        </a>
        <div className="topbar-right">
          <nav className="top-nav" aria-label="Main navigation">
            <a href={makeRouteUrl("overview", null, season)} className={route.type === "overview" ? "active" : ""}>Overview</a>
            <a href={makeRouteUrl("games", null, season)} className={route.type === "games" ? "active" : ""}>Games</a>
            <a href={makeRouteUrl("players", null, season)} className={route.type === "players" ? "active" : ""}>Players</a>
          </nav>
          <div className="season-field">
            <label htmlFor="season-select">Season</label>
            <select id="season-select" className="season-select" value={season} aria-label="Select season" disabled={seasonsLoading || Boolean(seasonsError)} onChange={(event) => onSeasonChange(event.target.value)}>
              {unavailableSeason && <option value={season}>Season {season} — no data</option>}
              {seasonOptions.map((availableSeason) => (
                <option key={availableSeason} value={String(availableSeason)}>Season {availableSeason}–{String(availableSeason + 1).slice(-2)}</option>
              ))}
              {!season && !seasonOptions.length && <option value="">{seasonsLoading ? "Loading seasons…" : "No seasons available"}</option>}
            </select>
          </div>
        </div>
      </header>
      <main className="main-content">
        {seasonsError ? (
          <div className="season-notice error" role="alert">
            <span>Available seasons could not be loaded: {seasonsError.message}</span>
            <button type="button" onClick={onRetrySeasons}>Try again</button>
          </div>
        ) : unavailableSeason ? (
          <div className="season-notice" role="status">
            No analytics data is available for season {season}. Choose an available season from the selector.
          </div>
        ) : !seasonsLoading && !seasonOptions.length ? (
          <div className="season-notice" role="status">No seasons with analytics data are available yet.</div>
        ) : null}
        {children}
      </main>
      <footer className="footer">
        <span>EuroLeague · Season {season || "Current season"}</span>
        <span>Analytics via FastAPI</span>
      </footer>
    </div>
  );
}

function OverviewPage({ season }) {
  const query = seasonQuery(season);
  const { data, error, loading, reload } = useApiData(
    async () => {
      const [teams, games, players] = await Promise.all([
        api(`/standings${query}`),
        api(`/games?${query ? `${query.slice(1)}&` : ""}limit=500`),
        api(`/players?${query ? `${query.slice(1)}&` : ""}limit=50`),
      ]);
      return { teams, games, players };
    },
    [season],
  );
  const teams = data?.teams ?? [];
  const games = data?.games ?? [];
  const players = data?.players ?? [];
  const playedGames = games.filter((game) => game.played);
  const leader = [...players].sort((a, b) => Number(b.points_per_game || 0) - Number(a.points_per_game || 0))[0];
  const leaderTeam = teams[0];

  return (
    <>
      <Heading eyebrow="League dashboard" title="The season, at a glance." description="Standings, recent results, and the players shaping the year." action={<span className="button-link">{teams.length} clubs <span aria-hidden="true">↗</span></span>} />
      {loading ? <LoadingState>Loading league data…</LoadingState> : error ? <Panel title="League data"><ErrorState error={error} onRetry={reload} /></Panel> : (
        <>
          <section className="stat-grid" aria-label="Season highlights">
            <StatCard label="Clubs" value={number(teams.length)} note="competing this season" />
            <StatCard label="Games played" value={number(playedGames.length)} note="results in the current season" />
            <StatCard label="Table leader" value={leaderTeam?.team_code || "—"} note={leaderTeam?.team_name || "Standings unavailable"} accent />
            <StatCard label="Scoring leader" value={leader?.player_name || "—"} note={leader ? `${number(leader.points_per_game, 1)} PPG · ${leader.team_code || ""}` : "Player stats unavailable"} accent />
          </section>
          <div className="content-grid">
            <div className="column-stack">
              <Panel title="League standings" meta={`${teams.length} TEAMS`}><StandingsTable teams={teams} season={season} /></Panel>
              <Panel title="Recent games" action={<a className="text-link" href={makeRouteUrl("games", null, season)}>View all games <span aria-hidden="true">→</span></a>}><RecentGames games={games} season={season} /></Panel>
            </div>
            <div className="column-stack">
              <Panel title="Player leaders" meta="SEASON AVERAGES"><PlayerTable players={leader ? [...players].sort((a, b) => Number(b.points_per_game || 0) - Number(a.points_per_game || 0)) : players} season={season} compact /></Panel>
              <Panel title="Top team" meta="TABLE LEADER">
                {leaderTeam ? (
                  <>
                    <div className="record-strip">
                      <div className="record-item"><div className="record-number accent-value">{number(leaderTeam.wins)}–{number(leaderTeam.losses)}</div><div className="record-caption">Record</div></div>
                      <div className="record-item"><div className="record-number">{number(leaderTeam.points_for_per_game, 1)}</div><div className="record-caption">Points / game</div></div>
                      <div className="record-item"><div className="record-number">{number(leaderTeam.point_difference)}</div><div className="record-caption">Point diff.</div></div>
                    </div>
                    <div className="panel-header"><a className="text-link" href={makeRouteUrl("teams", leaderTeam.team_code, season)}>View {leaderTeam.team_name} profile <span aria-hidden="true">→</span></a></div>
                  </>
                ) : <EmptyState>Team stats unavailable.</EmptyState>}
              </Panel>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function TeamPage({ teamCode, season }) {
  const query = seasonQuery(season);
  const { data, error, loading, reload } = useApiData(
    async () => {
      const [team, roster] = await Promise.all([
        api(`/teams/${encodeURIComponent(teamCode)}${query}`),
        api(`/players?${query ? `${query.slice(1)}&` : ""}team_code=${encodeURIComponent(teamCode)}&limit=50`),
      ]);
      return { team, roster };
    },
    [teamCode, season],
  );

  return (
    <>
      <Heading eyebrow="Club profile" title={data?.team.team_name || teamCode} description={data ? `Season ${data.team.season} · ${data.team.league_position ? `#${data.team.league_position} in the standings` : "Team analytics"}` : "Team performance and shot profile."} action={<a className="button-link" href={makeRouteUrl("overview", null, season)}>← League overview</a>} />
      {loading ? <LoadingState>Loading team profile…</LoadingState> : error ? <Panel title="Team data"><ErrorState error={error} onRetry={reload} /></Panel> : (
        <>
          <section className="stat-grid">
            <StatCard label="Record" value={`${number(data.team.wins)}–${number(data.team.losses)}`} note={`${number(data.team.games_played)} games played`} accent />
            <StatCard label="Win rate" value={percent(data.team.win_percentage)} note={`round ${number(data.team.standings_round)}`} />
            <StatCard label="Points / game" value={number(data.team.points_for_per_game, 1)} note={`${number(data.team.points_for)} total points`} />
            <StatCard label="Point differential" value={`${Number(data.team.point_differential) > 0 ? "+" : ""}${number(data.team.point_differential)}`} note={`${number(data.team.points_against_per_game, 1)} allowed / game`} accent={Number(data.team.point_differential) >= 0} />
          </section>
          <div className="content-grid">
            <div className="column-stack">
              <Panel title="Team roster" meta={`${data.roster.length} PLAYERS`}><PlayerTable players={data.roster} season={season} compact /></Panel>
              <TeamShotChart teamCode={teamCode} season={season} />
            </div>
            <div className="column-stack">
              <Panel title="Season record" meta="EUROLEAGUE"><DetailStats items={[["Wins", number(data.team.wins, 0), true], ["Losses", number(data.team.losses)], ["Position", number(data.team.league_position)]]} /></Panel>
              <Panel title="Scoring" meta="PERFORMANCE"><DetailStats items={[["Points for", number(data.team.points_for)], ["Points against", number(data.team.points_against)], ["For / game", number(data.team.points_for_per_game, 1)], ["Against / game", number(data.team.points_against_per_game, 1)]]} /></Panel>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function GamePage({ gameCode, season }) {
  const query = seasonQuery(season);
  const { data, error, loading, reload } = useApiData(
    async () => {
      const [game, shots] = await Promise.all([
        api(`/games/${encodeURIComponent(gameCode)}${query}`),
        api(`/shots?${query ? `${query.slice(1)}&` : ""}game_code=${encodeURIComponent(gameCode)}&limit=2000`),
      ]);
      return { game, shots };
    },
    [gameCode, season],
  );

  return (
    <>
      <Heading eyebrow="Game center" title={data ? `${data.game.home_team_code || "Home"} vs ${data.game.away_team_code || "Away"}` : `Game ${gameCode}`} description={data ? `${data.game.game_date || "Date TBC"} · ${data.game.played ? "Final" : "Upcoming"} · Game ${data.game.game_code}` : "Score, result, and shot locations."} action={<a className="button-link" href={makeRouteUrl("overview", null, season)}>← League overview</a>} />
      {loading ? <LoadingState>Loading game details…</LoadingState> : error ? <Panel title="Game data"><ErrorState error={error} onRetry={reload} /></Panel> : (
        <>
          <Panel title="Final score">
            <div className="game-scoreboard">
              <div className="score-team"><span className="team-badge">{data.game.home_team_code || "H"}</span><span className="score-team-code">{data.game.home_team_code}</span><span className="score-team-name">{data.game.home_team || "Home"}</span><span className={`score-number${Number(data.game.home_score) > Number(data.game.away_score) ? " accent-value" : ""}`}>{data.game.home_score ?? "—"}</span></div>
              <span className="score-divider">{data.game.played ? "FINAL" : "TIP-OFF"}</span>
              <div className="score-team"><span className="team-badge">{data.game.away_team_code || "A"}</span><span className="score-team-code">{data.game.away_team_code}</span><span className="score-team-name">{data.game.away_team || "Away"}</span><span className={`score-number${Number(data.game.away_score) > Number(data.game.home_score) ? " accent-value" : ""}`}>{data.game.away_score ?? "—"}</span></div>
            </div>
          </Panel>
          <div className="content-grid game-detail-grid">
            <div className="column-stack"><Panel title="Game shot chart" meta={`${data.shots.length} SHOTS`}><CourtChart shots={data.shots} /></Panel></div>
            <div className="column-stack"><Panel title="Game summary" meta="RESULT"><DetailStats items={[["Home score", number(data.game.home_score)], ["Away score", number(data.game.away_score)], ["Margin", `${Number(data.game.home_margin) > 0 ? "+" : ""}${number(data.game.home_margin)}`], ["Status", data.game.played ? "Final" : "Upcoming"]]} /></Panel></div>
          </div>
        </>
      )}
    </>
  );
}

function GamesTable({ games, season }) {
  if (!games.length) return <EmptyState>No games match these filters.</EmptyState>;

  return (
    <div className="table-scroll">
      <table>
        <thead><tr><th>Date</th><th>Game</th><th>Score</th><th>Status</th></tr></thead>
        <tbody>
          {games.map((game) => (
            <tr key={game.game_code}>
              <td className="mono">{game.game_date || "Date TBC"}</td>
              <td>
                <a className="game-link" href={makeRouteUrl("games", game.game_code, season)}>
                  {game.home_team_code || "Home"} vs {game.away_team_code || "Away"}
                  <span className="muted"> · {game.home_team || "Home"} vs {game.away_team || "Away"}</span>
                </a>
              </td>
              <td className="record">{game.played ? `${game.home_score ?? "—"}–${game.away_score ?? "—"}` : game.game_time || "—"}</td>
              <td><span className={`game-result${game.played ? " positive" : ""}`}>{game.played ? "FINAL" : "UPCOMING"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GamesPage({ season }) {
  const query = seasonQuery(season);
  const { data, error, loading, reload } = useApiData(
    () => api(`/games?${query ? `${query.slice(1)}&` : ""}limit=500`),
    [season],
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  useEffect(() => {
    setTeamFilter("all");
    setFromDate("");
    setToDate("");
  }, [season]);

  const games = data ?? [];
  const teams = [...new Set(games.flatMap((game) => [game.home_team_code, game.away_team_code]).filter(Boolean))].sort();
  const filteredGames = games
    .filter((game) => {
      const term = search.trim().toLocaleLowerCase();
      if (!term) return true;
      return [
        game.home_team,
        game.home_team_code,
        game.away_team,
        game.away_team_code,
        game.game_code,
      ].some((value) => String(value ?? "").toLocaleLowerCase().includes(term));
    })
    .filter((game) => statusFilter === "all" || (statusFilter === "played" ? game.played === true : game.played !== true))
    .filter((game) => teamFilter === "all" || game.home_team_code === teamFilter || game.away_team_code === teamFilter)
    .filter((game) => {
      if (!fromDate && !toDate) return true;
      const timestamp = Date.parse(game.game_date || "");
      if (!Number.isFinite(timestamp)) return false;
      const gameDate = new Date(timestamp).toISOString().slice(0, 10);
      return (!fromDate || gameDate >= fromDate) && (!toDate || gameDate <= toDate);
    })
    .sort((a, b) => {
      const dateOrder = Date.parse(b.game_date || "") - Date.parse(a.game_date || "");
      return (Number.isFinite(dateOrder) && dateOrder !== 0 ? dateOrder : 0)
        || Number(b.game_code) - Number(a.game_code);
    });
  const hasFilters = search.trim() || statusFilter !== "all" || teamFilter !== "all" || fromDate || toDate;
  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setTeamFilter("all");
    setFromDate("");
    setToDate("");
  };

  return (
    <>
      <Heading eyebrow="Season schedule" title="Every game, in one place." description="Browse results and upcoming fixtures, then open any game for its details." />
      {loading ? <LoadingState>Loading season games…</LoadingState> : error ? <Panel title="Game schedule"><ErrorState error={error} onRetry={reload} /></Panel> : (
        <Panel title="Games" meta={`${filteredGames.length} OF ${games.length}`}>
          <div className="game-filters">
            <label className="game-search">
              <span>Search teams or game</span>
              <input type="search" aria-label="Search games by team or game number" placeholder="Team name, code, or game #" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <label>
              <span>From</span>
              <input type="date" aria-label="Filter games from date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} />
            </label>
            <label>
              <span>To</span>
              <input type="date" aria-label="Filter games to date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} />
            </label>
            <label>
              <span>Status</span>
              <select aria-label="Filter games by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All games</option>
                <option value="played">Played</option>
                <option value="upcoming">Upcoming</option>
              </select>
            </label>
            <label>
              <span>Team</span>
              <select aria-label="Filter games by team" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
                <option value="all">All teams</option>
                {teams.map((team) => <option key={team} value={team}>{team}</option>)}
              </select>
            </label>
            {hasFilters && <button className="clear-game-filters" type="button" onClick={clearFilters}>Clear filters</button>}
          </div>
          <GamesTable games={filteredGames} season={season} />
        </Panel>
      )}
    </>
  );
}

function PlayerPage({ playerId, season }) {
  const query = seasonQuery(season);
  const { data, error, loading, reload } = useApiData(
    async () => {
      const [player, shots] = await Promise.all([
        api(`/players/${encodeURIComponent(playerId)}${query}`),
        api(`/shots?${query ? `${query.slice(1)}&` : ""}player_id=${encodeURIComponent(shotPlayerId(playerId))}&limit=2000`),
      ]);
      return { player, shots };
    },
    [playerId, season],
  );
  const player = data?.player;
  const twoPointMade = player ? Number(player.field_goals_made) - Number(player.three_point_field_goals_made) : null;
  const twoPointAttempted = player ? Number(player.field_goals_attempted) - Number(player.three_point_field_goals_attempted) : null;
  const valuationPerGame = player?.valuation != null && player.games_played
    ? Number(player.valuation) / Number(player.games_played)
    : null;

  return (
    <>
      <Heading eyebrow="Player profile" title={player?.player_name || playerId} description={player ? `${player.team_name || player.team_code || "EuroLeague"} · Season ${player.season}` : "Season performance and shot profile."} action={<a className="button-link" href={makeRouteUrl("overview", null, season)}>← League overview</a>} />
      {loading ? <LoadingState>Loading player profile…</LoadingState> : error ? <Panel title="Player data"><ErrorState error={error} onRetry={reload} /></Panel> : (
        <>
          <section className="stat-grid">
            <StatCard label="Points / game" value={number(player.points_per_game, 1)} note={`${number(player.points)} season points`} accent />
            <StatCard label="Rebounds / game" value={number(player.rebounds_per_game, 1)} note={`${number(player.rebounds)} total rebounds`} />
            <StatCard label="Assists / game" value={number(player.assists_per_game, 1)} note={`${number(player.games_played)} games`} />
            <StatCard label="Effective FG%" value={percent(player.effective_field_goal_percentage)} note={`${percent(player.three_point_percentage)} from three`} accent />
          </section>
          <div className="content-grid">
            <div className="column-stack">
              <Panel title="Shot chart" meta={`${data.shots.length} SHOTS`}><CourtChart shots={data.shots} /></Panel>
              <Panel title="Season totals" meta="ACCUMULATED">
                <DetailStats items={[
                  ["Games played", number(player.games_played)],
                  ["Points", number(player.points)],
                  ["Rebounds", number(player.rebounds)],
                  ["Assists", number(player.assists)],
                  ["Valuation", number(player.valuation)],
                  ["Field goals made", number(player.field_goals_made)],
                  ["Field goals attempted", number(player.field_goals_attempted)],
                  ["3-pointers made", number(player.three_point_field_goals_made)],
                ]} />
              </Panel>
            </div>
            <div className="column-stack">
              <Panel title="Per-game production" meta="AVERAGES">
                <DetailStats items={[
                  ["Points", number(player.points_per_game, 1)],
                  ["Rebounds", number(player.rebounds_per_game, 1)],
                  ["Assists", number(player.assists_per_game, 1)],
                  ["Valuation", number(valuationPerGame, 1)],
                ]} />
              </Panel>
              <Panel title="Shooting splits" meta="EFFICIENCY">
                <DetailStats items={[
                  ["Field goal %", percent(player.field_goal_percentage)],
                  ["2-point %", percent(twoPointAttempted > 0 ? twoPointMade / twoPointAttempted : null)],
                  ["3-point %", percent(player.three_point_percentage)],
                  ["Effective FG%", percent(player.effective_field_goal_percentage)],
                  ["2P made / att.", `${number(twoPointMade)} / ${number(twoPointAttempted)}`],
                  ["3P made / att.", `${number(player.three_point_field_goals_made)} / ${number(player.three_point_field_goals_attempted)}`],
                  ["FG made / att.", `${number(player.field_goals_made)} / ${number(player.field_goals_attempted)}`],
                  ["FG misses", number(Number(player.field_goals_attempted) - Number(player.field_goals_made))],
                ]} />
              </Panel>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function PlayersPage({ season }) {
  const query = seasonQuery(season);
  const { data, error, loading, reload } = useApiData(
    () => api(`/players?${query ? `${query.slice(1)}&` : ""}limit=100`),
    [season],
  );

  return (
    <>
      <Heading eyebrow="Player leaders" title="The people behind the numbers." description="Season performance, ranked by scoring." />
      {loading ? <LoadingState>Loading player leaders…</LoadingState> : error ? <Panel title="Player data"><ErrorState error={error} onRetry={reload} /></Panel> : (
        <Panel title="Player performance" meta={`${data.length} PLAYERS`}><PlayerTable players={data} season={season} /></Panel>
      )}
    </>
  );
}

function App() {
  const [route, setRoute] = useState(parseRoute);
  const [savedSeason, setSavedSeason] = useState(readSavedSeason);
  const { data: availableSeasons, error: seasonsError, loading: seasonsLoading, reload: reloadSeasons } = useApiData(
    () => api("/seasons"),
    [],
  );
  const season = route.season ?? (savedSeason || String(availableSeasons?.[0] ?? ""));
  const seasons = availableSeasons ?? [];

  useEffect(() => {
    if (!window.location.hash) window.location.hash = "#/";
    const onHashChange = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (route.season !== null) {
      setSavedSeason(route.season);
      localStorage.setItem("courtvision-season", route.season);
    }
  }, [route.season]);

  const handleSeasonChange = (value) => {
    const nextSeason = /^\d{4}$/.test(value) ? value : "";
    setSavedSeason(nextSeason);
    localStorage.setItem("courtvision-season", nextSeason);
    window.location.hash = makeRouteUrl(route.type === "overview" ? "overview" : route.type, route.id, nextSeason);
  };

  const page = useMemo(() => {
    if (route.type === "teams") return <TeamPage teamCode={route.id} season={season} />;
    if (route.type === "games" && route.id) return <GamePage gameCode={route.id} season={season} />;
    if (route.type === "games") return <GamesPage season={season} />;
    if (route.type === "players" && route.id) return <PlayerPage playerId={route.id} season={season} />;
    if (route.type === "players") return <PlayersPage season={season} />;
    return <OverviewPage season={season} />;
  }, [route.type, route.id, season]);

  return (
    <AppShell
      route={route}
      season={season}
      seasons={seasons}
      seasonsLoading={seasonsLoading}
      seasonsError={seasonsError}
      onRetrySeasons={reloadSeasons}
      onSeasonChange={handleSeasonChange}
    >
      {page}
    </AppShell>
  );
}

createRoot(document.getElementById("app")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
