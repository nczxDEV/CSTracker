//! Local CS2 demo import for the 2D analyzer. No demo bytes leave the PC.
use awpy::demo::Parser;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[path = "demo_coach.rs"]
pub mod coach;
#[path = "demo_library.rs"]
pub mod library;

#[derive(Default)]
pub struct DemoAnalyzerState(pub Mutex<Option<ImportedDemo>>, AtomicBool);

struct ImportGuard<'a>(&'a AtomicBool);
impl Drop for ImportGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

#[derive(Serialize, Deserialize)]
pub struct ImportedDemo {
    summary: DemoSummary,
    rounds: Vec<RoundReplay>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DemoSummary {
    #[serde(default)]
    library_id: Option<String>,
    file_name: String,
    map_name: String,
    tick_rate: f32,
    rounds: Vec<RoundSummary>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoundSummary {
    number: i32,
    start_tick: i32,
    end_tick: i32,
    winner_side: String,
    reason: String,
    is_knife_round: bool,
    kills: usize,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoundReplay {
    summary: RoundSummary,
    frames: Vec<ReplayFrame>,
    events: Vec<ReplayEvent>,
    grenades: Vec<GrenadeTrack>,
    areas: Vec<UtilityArea>,
    economy: Vec<TeamEconomy>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrenadeTrack {
    kind: String,
    thrower: String,
    thrower_id: Option<String>,
    points: Vec<GrenadePoint>,
}
#[derive(Clone, Serialize, Deserialize)]
struct GrenadePoint {
    tick: i32,
    x: f32,
    y: f32,
    z: f32,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UtilityArea {
    kind: String,
    start_tick: i32,
    end_tick: i32,
    x: f32,
    y: f32,
    z: f32,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TeamEconomy {
    side: String,
    equipment_value: i32,
    buy_type: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReplayFrame {
    tick: i32,
    players: Vec<ReplayPlayer>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReplayPlayer {
    id: String,
    name: String,
    side: String,
    x: f32,
    y: f32,
    z: f32,
    yaw: f32,
    health: i32,
    money: i32,
    equipment_value: i32,
    armor: i32,
    has_helmet: bool,
    has_defuser: bool,
    active_weapon: String,
    inventory: String,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReplayEvent {
    tick: i32,
    kind: String,
    label: String,
    x: Option<f32>,
    y: Option<f32>,
    z: Option<f32>,
    actor_id: Option<String>,
    target_id: Option<String>,
    assist_id: Option<String>,
    actor_side: Option<String>,
    target_side: Option<String>,
    action: Option<String>,
    is_trade: bool,
    victim_traded: bool,
}

fn round_index(rounds: &[RoundReplay], tick: i32) -> Option<usize> {
    rounds
        .iter()
        .position(|round| tick >= round.summary.start_tick && tick <= round.summary.end_tick)
}

#[cfg(test)]
fn parse_demo(path: &Path) -> Result<ImportedDemo, String> {
    parse_demo_with_progress(path, |_| {})
}

fn parse_demo_with_progress(path: &Path, progress: impl Fn(&str)) -> Result<ImportedDemo, String> {
    progress("Reading rounds and match events…");
    let parser = Parser::from_file(path).map_err(|e| format!("Could not open demo: {e}"))?;
    parser
        .verify()
        .map_err(|e| format!("Invalid CS2 demo: {e}"))?;
    let header = parser
        .file_header()
        .map_err(|e| format!("Could not read demo header: {e}"))?;
    let map_name = header.map_name.unwrap_or_else(|| "unknown".to_string());
    let tick_rate = parser.tickrate();
    let parsed_rounds = parser
        .rounds()
        .map_err(|e| format!("Could not read rounds: {e}"))?;
    if parsed_rounds.is_empty() {
        return Err("No completed rounds were found in this demo.".to_string());
    }

    let mut previous_end = 0;
    let mut rounds: Vec<RoundReplay> = parsed_rounds
        .into_iter()
        .map(|round| {
            let start = round
                .start_tick
                .or(round.freeze_end_tick)
                .unwrap_or(previous_end)
                .max(0);
            previous_end = round.end_tick.saturating_add(1);
            RoundReplay {
                summary: RoundSummary {
                    number: round.round_num,
                    start_tick: start,
                    end_tick: round.end_tick.max(start),
                    winner_side: round.winner_side,
                    reason: round.reason_name,
                    is_knife_round: round.is_knife_round,
                    kills: 0,
                },
                frames: Vec::new(),
                events: Vec::new(),
                grenades: Vec::new(),
                areas: Vec::new(),
                economy: Vec::new(),
            }
        })
        .collect();

    for kill in parser
        .kills()
        .map_err(|e| format!("Could not read kills: {e}"))?
    {
        if let Some(index) = round_index(&rounds, kill.tick) {
            rounds[index].summary.kills += 1;
            rounds[index].events.push(ReplayEvent {
                tick: kill.tick,
                kind: "kill".to_string(),
                label: format!(
                    "{} eliminated {}{}",
                    kill.attacker_name.as_deref().unwrap_or("World"),
                    kill.victim_name.as_deref().unwrap_or("Unknown"),
                    if kill.headshot { " · headshot" } else { "" }
                ),
                x: kill.victim_x,
                y: kill.victim_y,
                z: kill.victim_z,
                actor_id: kill.attacker_steamid.map(|id| id.to_string()),
                target_id: kill.victim_steamid.map(|id| id.to_string()),
                assist_id: kill.assister_steamid.map(|id| id.to_string()),
                actor_side: kill.attacker_side,
                target_side: kill.victim_side,
                action: Some(kill.weapon),
                is_trade: kill.is_trade,
                victim_traded: kill.victim_traded,
            });
        }
    }
    for bomb in parser
        .bomb()
        .map_err(|e| format!("Could not read bomb events: {e}"))?
    {
        if let Some(index) = round_index(&rounds, bomb.tick) {
            rounds[index].events.push(ReplayEvent {
                tick: bomb.tick,
                kind: "bomb".to_string(),
                label: format!(
                    "{} · {}{}",
                    bomb.name.as_deref().unwrap_or("Bomb"),
                    bomb.event.replace('_', " "),
                    bomb.bombsite
                        .map(|site| format!(" · site {site}"))
                        .unwrap_or_default()
                ),
                x: bomb.x,
                y: bomb.y,
                z: bomb.z,
                actor_id: bomb.steamid.map(|id| id.to_string()),
                action: Some(bomb.event),
                ..ReplayEvent::default()
            });
        }
    }

    progress("Reading grenade trajectories, smoke and fire…");
    let mut tracks: BTreeMap<(i32, u32), GrenadeTrack> = BTreeMap::new();
    for grenade in parser
        .grenades()
        .map_err(|e| format!("Could not read grenades: {e}"))?
    {
        if !grenade.x.is_finite() || !grenade.y.is_finite() || !grenade.z.is_finite() {
            continue;
        }
        let track = tracks
            .entry((grenade.entity_id, grenade.entity_serial))
            .or_insert_with(|| GrenadeTrack {
                kind: grenade.grenade_type.clone(),
                thrower_id: grenade.thrower_steamid.map(|id| id.to_string()),
                thrower: grenade
                    .thrower_name
                    .clone()
                    .unwrap_or_else(|| "Unknown".into()),
                points: Vec::new(),
            });
        if let Some(id) = grenade.thrower_steamid.filter(|id| *id != 0) { track.thrower_id = Some(id.to_string()); }
        if let Some(name) = grenade.thrower_name.filter(|name| !name.is_empty() && name != "Unknown") { track.thrower = name; }
        track.points.push(GrenadePoint {
            tick: grenade.tick,
            x: grenade.x,
            y: grenade.y,
            z: grenade.z,
        });
    }
    let shots = parser.shots().map_err(|e| format!("Could not read weapon events: {e}"))?;
    let events = parser.events(None).map_err(|e| format!("Could not read throw events: {e}"))?;
    let key = |e: &awpy::demo::GameEvent, field: &str| e.keys.iter().find(|(k,_)| k == field).map(|(_,v)| v.clone());
    let mut identities = BTreeMap::new();
    for event in events.iter().filter(|e| e.name == "weapon_fire") {
        let weapon = key(event, "weapon").unwrap_or_default();
        let matches: Vec<_> = shots.iter().filter(|s| s.tick == event.tick && s.weapon == weapon && s.name.is_some()).collect();
        if matches.len() == 1 {
            if let Some(user) = key(event, "userid_pawn").or_else(|| key(event, "userid")) {
                identities.insert(user, (matches[0].name.clone().unwrap(), matches[0].steamid));
            }
        }
    }
    let raw_throws: Vec<_> = events.iter().filter(|e| e.name == "grenade_thrown").collect();
    for event in &raw_throws {
        if let Some(index) = round_index(&rounds, event.tick) {
            let identity = key(event, "userid_pawn").or_else(|| key(event, "userid")).and_then(|id| identities.get(&id));
            let weapon = key(event, "weapon").unwrap_or_else(|| "grenade".into());
            rounds[index].events.push(ReplayEvent { tick: event.tick, kind: "grenade".into(), label: format!("{} · {}", identity.map(|p| p.0.as_str()).unwrap_or("Unidentified player"), weapon), actor_id: identity.and_then(|p| p.1).map(|id| id.to_string()), action: Some(weapon), ..ReplayEvent::default() });
        }
    }
    let throws = shots.into_iter().map(|mut s| { s.weapon = s.weapon.strip_prefix("weapon_").unwrap_or(&s.weapon).to_owned(); s })
        .filter(|s| matches!(s.weapon.as_str(), "hegrenade"|"flashbang"|"smokegrenade"|"molotov"|"incgrenade"|"incendiary"|"decoy")).collect::<Vec<_>>();
    for shot in &throws {
        if !raw_throws.is_empty() { continue; }
        if let Some(index) = round_index(&rounds, shot.tick) {
            rounds[index].events.push(ReplayEvent { tick: shot.tick, kind: "grenade".into(),
                label: format!("{} · {}", shot.name.as_deref().unwrap_or("Unidentified player"), shot.weapon),
                actor_id: shot.steamid.map(|id| id.to_string()), action: Some(shot.weapon.clone()),
                x: shot.x, y: shot.y, z: shot.z, ..ReplayEvent::default() });
        }
    }
    for mut track in tracks.into_values() {
        track.points.sort_by_key(|p| p.tick);
        if let Some(first) = track.points.first() {
            if let Some(index) = round_index(&rounds, first.tick) {
                if throws.is_empty() && raw_throws.is_empty() { rounds[index].events.push(ReplayEvent {
                    tick: first.tick,
                    kind: "grenade".into(),
                    label: format!("{} · {}", track.thrower, track.kind),
                    x: Some(first.x),
                    y: Some(first.y),
                    z: Some(first.z),
                    actor_id: track.thrower_id.clone(),
                    action: Some(track.kind.clone()),
                    ..ReplayEvent::default()
                }); }
                rounds[index].grenades.push(track);
            }
        }
    }
    for smoke in parser
        .smokes()
        .map_err(|e| format!("Could not read smokes: {e}"))?
    {
        if let Some(index) = round_index(&rounds, smoke.start_tick) {
            rounds[index].areas.push(UtilityArea {
                kind: "smoke".into(),
                start_tick: smoke.start_tick,
                end_tick: smoke.end_tick,
                x: smoke.x,
                y: smoke.y,
                z: smoke.z,
            });
        }
    }
    for fire in parser
        .fires()
        .map_err(|e| format!("Could not read fire: {e}"))?
    {
        if let Some(index) = round_index(&rounds, fire.start_tick) {
            rounds[index].areas.push(UtilityArea {
                kind: "fire".into(),
                start_tick: fire.start_tick,
                end_tick: fire.end_tick,
                x: fire.x,
                y: fire.y,
                z: fire.z,
            });
        }
    }
    progress("Reading round economy…");
    for economy in parser
        .round_economy()
        .map_err(|e| format!("Could not read economy: {e}"))?
    {
        if let Some(round) = rounds
            .iter_mut()
            .find(|r| r.summary.number == economy.round_num)
        {
            round.economy.push(TeamEconomy {
                side: economy.side.into(),
                equipment_value: economy.equipment_value,
                buy_type: economy.buy_type.into(),
            });
        }
    }
    progress("Reading player movement and equipment…");
    let start_tick = rounds.first().unwrap().summary.start_tick;
    let end_tick = rounds.last().unwrap().summary.end_tick;
    let stride = (tick_rate / 8.0).round().max(1.0) as i32;
    let states = parser
        .snapshots_query(Some(stride), &HashSet::new(), start_tick, end_tick)
        .map_err(|e| format!("Could not read player positions: {e}"))?;
    let mut frames: BTreeMap<i32, Vec<ReplayPlayer>> = BTreeMap::new();
    for player in states {
        let (Some(x), Some(y), Some(z)) = (player.x, player.y, player.z) else {
            continue;
        };
        if !x.is_finite() || !y.is_finite() || !z.is_finite() {
            continue;
        }
        let id = player
            .steamid
            .map(|id| id.to_string())
            .unwrap_or_else(|| format!("bot:{}", player.name.as_deref().unwrap_or("unknown")));
        frames.entry(player.tick).or_default().push(ReplayPlayer {
            id,
            name: player.name.unwrap_or_else(|| "Unknown".to_string()),
            side: player.side.unwrap_or("unknown").to_string(),
            x,
            y,
            z,
            yaw: player.yaw,
            health: player.health,
            money: player.money,
            equipment_value: player.equipment_value,
            armor: player.armor,
            has_helmet: player.has_helmet,
            has_defuser: player.has_defuser,
            active_weapon: player.active_weapon.unwrap_or("—").into(),
            inventory: player.inventory,
        });
    }
    for (tick, players) in frames {
        if let Some(index) = round_index(&rounds, tick) {
            rounds[index].frames.push(ReplayFrame { tick, players });
        }
    }
    for round in &mut rounds {
        restore_dead_player_names(round);
        let names: BTreeMap<String, String> = round.frames.iter().flat_map(|f| &f.players)
            .filter(|p| p.name != "Unknown").map(|p| (p.id.clone(), p.name.clone())).collect();
        for track in &mut round.grenades {
            if track.thrower == "Unknown" {
                if let Some(name) = track.thrower_id.as_ref().and_then(|id| names.get(id)) { track.thrower = name.clone(); }
            }
        }
        for event in &mut round.events {
            if event.kind == "grenade" {
                if let Some(name) = event.actor_id.as_ref().and_then(|id| names.get(id)) {
                    event.label = format!("{} · {}", name, event.action.as_deref().unwrap_or("grenade"));
                }
            }
        }
        round.events.sort_by_key(|event| event.tick);
    }
    let summary = DemoSummary {
        library_id: None,
        file_name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("demo.dem")
            .to_string(),
        map_name,
        tick_rate,
        rounds: rounds.iter().map(|round| round.summary.clone()).collect(),
    };
    Ok(ImportedDemo { summary, rounds })
}

#[tauri::command]
pub async fn import_cs2_demo(app: AppHandle) -> Result<Option<DemoSummary>, String> {
    // Native dialogs and CPU-heavy parsing must never block the window's event loop.
    tauri::async_runtime::spawn_blocking(move || import_demo_on_worker(app))
        .await
        .map_err(|e| format!("Demo import worker failed: {e}"))?
}

fn import_demo_on_worker(app: AppHandle) -> Result<Option<DemoSummary>, String> {
    let state = app.state::<DemoAnalyzerState>();
    if state.1.swap(true, Ordering::AcqRel) {
        return Err("A demo import is already running. Wait for it to finish.".into());
    }
    let _guard = ImportGuard(&state.1);
    let picked = app
        .dialog()
        .file()
        .set_title("Import CS2 Demo")
        .add_filter("CS2 demo", &["dem"])
        .blocking_pick_file();
    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|e| e.to_string())?;
    if path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| !ext.eq_ignore_ascii_case("dem"))
        .unwrap_or(true)
    {
        return Err("Choose a .dem file.".to_string());
    }
    let root = library::root(&app)?;
    let imported = if let Some(cached) = library::find_cached(&root, &path)? {
        let _ = app.emit("demo-import-progress", "Opening cached replay…");
        cached
    } else {
        let mut demo = parse_demo_with_progress(&path, |message| {
            let _ = app.emit("demo-import-progress", message);
        })?;
        let _ = app.emit("demo-import-progress", "Saving to Past demos…");
        library::save(&root, &path, &mut demo)?;
        demo
    };
    let summary = imported.summary.clone();
    *state.0.lock().map_err(|e| e.to_string())? = Some(imported);
    let _ = app.emit("demo-import-complete", &summary);
    Ok(Some(summary))
}

#[tauri::command]
pub async fn open_demo_analyzer(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("demo-analyzer") {
        window.show().map_err(|e| e.to_string())?;
        return window.set_focus().map_err(|e| e.to_string());
    }
    tauri::WebviewWindowBuilder::new(
        &app,
        "demo-analyzer",
        tauri::WebviewUrl::App("demo-analyzer.html".into()),
    )
    .title("CS Tracker · Demo Studio")
    .inner_size(1440.0, 940.0)
    .min_inner_size(960.0, 680.0)
    .resizable(true)
    .center()
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn open_player_hq_demo(app: AppHandle, id: String, round: Option<i32>) -> Result<(), String> {
    library::open_past_demo(app.clone(), id.clone()).await?;
    if let Some(window) = app.get_webview_window("demo-analyzer") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        window.emit("player-hq-open-demo", serde_json::json!({"id":id,"round":round})).map_err(|e| e.to_string())?;
    } else {
        let url = round.map(|r|format!("demo-analyzer.html?hq=1&round={r}")).unwrap_or("demo-analyzer.html?hq=1".into());
        tauri::WebviewWindowBuilder::new(&app, "demo-analyzer", tauri::WebviewUrl::App(url.into()))
            .title("CS Tracker · Demo Studio").inner_size(1440.0,940.0).min_inner_size(960.0,680.0).build().map_err(|e|e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_cs2_demo_summary(
    state: State<'_, DemoAnalyzerState>,
) -> Result<Option<DemoSummary>, String> {
    Ok(state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .map(|demo| demo.summary.clone()))
}

#[tauri::command]
pub fn get_cs2_demo_round(
    state: State<'_, DemoAnalyzerState>,
    number: i32,
) -> Result<RoundReplay, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let demo = guard.as_ref().ok_or("Import a demo first.")?;
    demo.rounds
        .iter()
        .find(|round| round.summary.number == number)
        .cloned()
        .map(|mut round| { restore_dead_player_names(&mut round); round })
        .ok_or_else(|| format!("Round {number} was not found."))
}

fn restore_dead_player_names(round: &mut RoundReplay) {
    let mut known: BTreeMap<String, ReplayPlayer> = BTreeMap::new();
    for frame in &mut round.frames {
        // Pawn destruction produces duplicate anonymous placeholders. Never use
        // their order or proximity to guess who they represent.
        frame.players.retain(|p| !(p.id == "bot:unknown" && p.name == "Unknown" && p.health <= 0));
        for player in &mut frame.players {
            if let Some(previous) = known.get(&player.id) {
                if player.name == "Unknown" || player.name.is_empty() { player.name = previous.name.clone(); }
            }
            known.insert(player.id.clone(), player.clone());
        }
        let present: HashSet<_> = frame.players.iter().map(|p| p.id.clone()).collect();
        for (id, previous) in &known {
            if present.contains(id) { continue; }
            if round.events.iter().any(|e| e.kind == "kill" && e.tick <= frame.tick && e.target_id.as_ref() == Some(id)) {
                let mut dead = previous.clone();
                dead.health = 0;
                dead.active_weapon.clear(); dead.inventory.clear();
                frame.players.push(dead);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore]
    fn restores_dead_names_from_real_fixture() {
        let bytes = std::fs::read(std::env::var("CSTRACKER_LIBRARY_TEST_FIXTURE").expect("set fixture path")).unwrap();
        let mut demo: ImportedDemo = serde_json::from_slice(&bytes).unwrap();
        let before = demo.rounds.iter().flat_map(|r| &r.frames).flat_map(|f| &f.players).filter(|p| p.name == "Unknown" && p.health <= 0).count();
        for round in &mut demo.rounds {
            let roster_size = round.frames.first().unwrap().players.len();
            restore_dead_player_names(round);
            assert_eq!(round.frames.last().unwrap().players.len(), roster_size, "end-of-round roster must retain the dead players");
            for frame in &round.frames {
                let ids: HashSet<_> = frame.players.iter().map(|p| &p.id).collect();
                assert_eq!(ids.len(), frame.players.len());
                assert!(frame.players.iter().all(|p| p.name != "Unknown"));
                for player in &frame.players {
                    if round.events.iter().any(|e| e.kind == "kill" && e.tick <= frame.tick && e.target_id.as_ref() == Some(&player.id)) {
                        assert_eq!(player.health, 0, "dead player must not be resurrected");
                    }
                }
            }
        }
        println!("Corrected {before} anonymous dead-player samples across {} rounds", demo.rounds.len());
    }

    // Manual integration check with a local recording. Run with
    // CSTRACKER_TEST_DEMO pointing to a .dem file and `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn inspect_throw_sources() {
        let path = std::env::var("CSTRACKER_TEST_DEMO").unwrap();
        let parser = Parser::from_file(Path::new(&path)).unwrap();
        let shots = parser.shots().unwrap();
        let grenades: Vec<_> = shots.iter().filter(|s| ["grenade", "flashbang", "molotov", "decoy"].iter().any(|name| s.weapon.contains(name))).collect();
        println!("THROWS {} UNNAMED {} SAMPLE {:?}",grenades.len(),grenades.iter().filter(|s| s.name.is_none()).count(),grenades.iter().take(3).map(|s| (&s.name,&s.weapon)).collect::<Vec<_>>());
        assert!(!grenades.is_empty());
        assert!(grenades.iter().all(|s| s.name.is_some()));
    }

    #[test]
    #[ignore]
    fn parses_a_real_demo() {
        let path = std::env::var("CSTRACKER_TEST_DEMO").expect("set CSTRACKER_TEST_DEMO");
        let demo = parse_demo(Path::new(&path)).expect("demo should parse");
        println!(
            "map={}, rounds={}, sampled frames={}, kills={}",
            demo.summary.map_name,
            demo.rounds.len(),
            demo.rounds
                .iter()
                .map(|round| round.frames.len())
                .sum::<usize>(),
            demo.rounds
                .iter()
                .map(|round| round.summary.kills)
                .sum::<usize>()
        );
        assert!(!demo.summary.rounds.is_empty());
        assert!(demo.rounds.iter().any(|round| !round.frames.is_empty()));
        let maps: serde_json::Value =
            serde_json::from_str(include_str!("../../src/assets/demo-radars/map-data.json"))
                .unwrap();
        let map = &maps[&demo.summary.map_name];
        let (Some(pos_x), Some(pos_y), Some(scale)) = (
            map["pos_x"].as_f64(),
            map["pos_y"].as_f64(),
            map["scale"].as_f64(),
        ) else {
            panic!("No radar transform for {}", demo.summary.map_name);
        };
        let points: Vec<_> = demo
            .rounds
            .iter()
            .flat_map(|round| &round.frames)
            .flat_map(|frame| &frame.players)
            .collect();
        let visible = points
            .iter()
            .filter(|player| {
                let x = (f64::from(player.x) - pos_x) / scale;
                let y = (pos_y - f64::from(player.y)) / scale;
                (0.0..=1024.0).contains(&x) && (0.0..=1024.0).contains(&y)
            })
            .count();
        println!("radar points on image: {visible}/{}", points.len());
        assert!(visible * 10 >= points.len() * 9);
        let grenades = demo.rounds.iter().map(|r| r.grenades.len()).sum::<usize>();
        let areas = demo.rounds.iter().map(|r| r.areas.len()).sum::<usize>();
        let economies = demo.rounds.iter().map(|r| r.economy.len()).sum::<usize>();
        println!("grenade tracks={grenades}, smoke/fire areas={areas}, team economies={economies}");
        assert!(
            grenades > 0,
            "test recording should contain thrown grenades"
        );
        assert!(areas > 0, "test recording should contain smoke/fire");
        assert!(economies > 0, "test recording should contain economy data");
        assert!(points.iter().any(|p| p.money > 0 && p.equipment_value > 0));
        for round in &demo.rounds {
            let selected: Vec<_> = round
                .frames
                .first()
                .unwrap()
                .players
                .iter()
                .take(2)
                .map(|p| p.id.clone())
                .collect();
            let payload = coach::evidence_for(&demo, round.summary.number, &selected).unwrap();
            let encoded = payload.to_string();
            assert!(encoded.len() < 200_000);
            assert!(!encoded.contains(&demo.summary.file_name));
            for id in &selected {
                assert!(!encoded.contains(id), "Steam ID sent to coach");
            }
            assert_eq!(
                payload["selectedPlayers"].as_array().unwrap().len(),
                selected.len()
            );
        }
        for round in &demo.rounds {
            assert!(round
                .frames
                .windows(2)
                .all(|pair| pair[0].tick < pair[1].tick));
            assert!(round
                .grenades
                .iter()
                .all(|g| g.points.windows(2).all(|p| p[0].tick <= p[1].tick)));
            assert!(round.areas.iter().all(|a| a.start_tick <= a.end_tick));
        }
        if let Ok(output) = std::env::var("CSTRACKER_TEST_OUTPUT") {
            std::fs::write(
                output,
                serde_json::to_string(
                    &serde_json::json!({"summary": demo.summary, "rounds": demo.rounds}),
                )
                .unwrap(),
            )
            .unwrap();
        }
    }
}
