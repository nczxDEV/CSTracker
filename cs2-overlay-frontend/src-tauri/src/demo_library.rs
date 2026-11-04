use super::*;
use std::{
    fs,
    hash::{Hash, Hasher},
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

const VERSION: u32 = 2;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    id: String,
    file_name: String,
    map_name: String,
    imported_at: u64,
    rounds: usize,
    players: Vec<String>,
    schema_version: u32,
    #[serde(skip)]
    source_key: String,
}
// Metadata on disk retains the fingerprint; the frontend never needs source paths.
#[derive(Serialize, Deserialize)]
struct StoredEntry {
    entry: LibraryEntry,
    fingerprint: String,
}

pub(super) fn root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("demo-library"))
        .map_err(|_| "Could not find the local demo library folder.".into())
}
fn fingerprint(path: &Path) -> Result<String, String> {
    let meta = fs::metadata(path).map_err(|_| "Could not read the demo file.".to_string())?;
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    fs::canonicalize(path)
        .unwrap_or_else(|_| path.to_path_buf())
        .hash(&mut hash);
    meta.len().hash(&mut hash);
    meta.modified().ok().hash(&mut hash);
    VERSION.hash(&mut hash);
    Ok(format!("{:x}", hash.finish()))
}
fn entries(root: &Path) -> Result<Vec<LibraryEntry>, String> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut result = Vec::new();
    for dir in fs::read_dir(root)
        .map_err(|_| "Could not read Past demos.")?
        .flatten()
    {
        let Ok(bytes) = fs::read(dir.path().join("metadata.json")) else {
            continue;
        };
        let Ok(mut stored) = serde_json::from_slice::<StoredEntry>(&bytes) else {
            continue;
        };
        if stored.entry.schema_version != VERSION {
            continue;
        }
        stored.entry.source_key = stored.fingerprint;
        result.push(stored.entry);
    }
    result.sort_by(|a, b| b.imported_at.cmp(&a.imported_at));
    Ok(result)
}
fn load(root: &Path, id: &str) -> Result<ImportedDemo, String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return Err("Invalid demo ID.".into());
    }
    let data = fs::read(root.join(id).join("replay.json"))
        .map_err(|_| "Cached replay is unavailable. Import the original .dem again.".to_string())?;
    let mut demo: ImportedDemo = serde_json::from_slice(&data)
        .map_err(|_| "Cached replay is damaged. Import the original .dem again.".to_string())?;
    for round in &mut demo.rounds { restore_dead_player_names(round); }
    Ok(demo)
}
pub(super) fn find_cached(root: &Path, path: &Path) -> Result<Option<ImportedDemo>, String> {
    let key = fingerprint(path)?;
    for entry in entries(root)? {
        if entry.source_key == key {
            if let Ok(demo) = load(root, &entry.id) {
                return Ok(Some(demo));
            }
        }
    }
    Ok(None)
}
pub(super) fn save(root: &Path, path: &Path, demo: &mut ImportedDemo) -> Result<(), String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Invalid system clock.")?;
    let id = format!("{:x}-{:x}", now.as_nanos(), std::process::id());
    let dir = root.join(&id);
    fs::create_dir_all(&dir).map_err(|_| "Could not create local demo cache.")?;
    demo.summary.library_id = Some(id.clone());
    let names: BTreeMap<_, _> = demo
        .rounds
        .iter()
        .flat_map(|r| &r.frames)
        .flat_map(|f| &f.players)
        .filter(|p| p.id != "bot:unknown")
        .map(|p| (p.id.clone(), p.name.clone()))
        .collect();
    let key = fingerprint(path)?;
    let stored = StoredEntry {
        entry: LibraryEntry {
            id,
            file_name: demo.summary.file_name.clone(),
            map_name: demo.summary.map_name.clone(),
            imported_at: now.as_secs(),
            rounds: demo.rounds.len(),
            players: names.into_values().collect(),
            schema_version: VERSION,
            source_key: String::new(),
        },
        fingerprint: key,
    };
    // Metadata is the commit marker: incomplete cache writes never appear in the library.
    let replay =
        fs::File::create(dir.join("replay.json")).map_err(|_| "Could not save cached replay.")?;
    let mut writer = std::io::BufWriter::new(replay);
    serde_json::to_writer(&mut writer, demo).map_err(|_| "Could not save cached replay.")?;
    std::io::Write::flush(&mut writer).map_err(|_| "Could not finish saving replay.")?;
    fs::write(
        dir.join("metadata.json"),
        serde_json::to_vec(&stored).map_err(|_| "Could not encode demo metadata.")?,
    )
    .map_err(|_| "Could not save demo metadata.")?;
    Ok(())
}
#[tauri::command]
pub async fn list_past_demos(app: AppHandle) -> Result<Vec<LibraryEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || entries(&root(&app)?))
        .await
        .map_err(|_| "Library worker failed.".to_string())?
}

// Read one cached replay on demand, without replacing the viewer's active demo.
#[tauri::command]
pub async fn player_hq_demo_metrics(app: AppHandle, id: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let demo = load(&root(&app)?, &id)?;
        Ok(hq_metrics(&demo, &id))
    }).await.map_err(|_| "Demo metrics worker failed.".to_string())?
}
fn hq_metrics(demo: &ImportedDemo, id: &str) -> serde_json::Value {
        let mut rows = Vec::new();
        for round in &demo.rounds {
            let mut players = BTreeMap::new();
            for frame in &round.frames {
                for p in &frame.players {
                    if p.id != "bot:unknown" && p.name != "Unknown" { players.entry(p.id.clone()).or_insert(p); }
                }
            }
            let kills: Vec<_> = round.events.iter().filter(|e| e.kind == "kill").collect();
            for (pid, player) in &players {
                let deaths = kills.iter().filter(|e| e.target_id.as_ref() == Some(pid)).count();
                let last = round.frames.last().and_then(|f| f.players.iter().find(|p| &p.id == pid));
                let teammates: Vec<_> = players.iter().filter(|(other,p)| *other != pid && p.side == player.side).map(|(_,p)| p.name.clone()).collect();
                rows.push(serde_json::json!({
                    "playerId": pid, "name": player.name, "side": player.side,
                    "round": round.summary.number, "teammates": teammates,
                    "kills": kills.iter().filter(|e| e.actor_id.as_ref() == Some(pid) && e.target_side != e.actor_side).count(),
                    "deaths": deaths,
                    "openingKill": kills.first().map(|e| e.actor_id.as_ref() == Some(pid) && e.target_side != e.actor_side).unwrap_or(false),
                    "openingDeath": kills.first().map(|e| e.target_id.as_ref() == Some(pid)).unwrap_or(false),
                    "tradeKills": kills.iter().filter(|e| e.actor_id.as_ref() == Some(pid) && e.is_trade).count(),
                    "tradedDeaths": kills.iter().filter(|e| e.target_id.as_ref() == Some(pid) && e.victim_traded).count(),
                    "survived": last.map(|p| p.health > 0),
                    "utilityThrows": round.events.iter().filter(|e| e.kind == "grenade" && e.actor_id.as_ref() == Some(pid)).count()
                }));
            }
        }
        serde_json::json!({"demoId": id, "map": demo.summary.map_name, "source": "local-demo", "rows": rows})
}
#[tauri::command]
pub async fn open_past_demo(app: AppHandle, id: String) -> Result<DemoSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<DemoAnalyzerState>();
        if state.1.swap(true, Ordering::AcqRel) {
            return Err("Another demo is loading. Please wait.".into());
        }
        let _guard = ImportGuard(&state.1);
        let demo = load(&root(&app)?, &id)?;
        let summary = demo.summary.clone();
        *state.0.lock().map_err(|_| "Could not open cached demo.")? = Some(demo);
        Ok(summary)
    })
    .await
    .map_err(|_| "Library worker failed.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore]
    fn player_hq_real_cached_metrics() {
        let fixture = std::env::var("CSTRACKER_LIBRARY_TEST_FIXTURE").expect("set fixture path");
        let mut demo: ImportedDemo = serde_json::from_slice(&fs::read(fixture).unwrap()).unwrap();
        for round in &mut demo.rounds { restore_dead_player_names(round); }
        let result = hq_metrics(&demo,"test");
        let rows = result["rows"].as_array().unwrap();
        assert_eq!(rows.len(),demo.rounds.len()*10);
        assert!(rows.iter().all(|r|r["name"]!="Unknown" && r["survived"].is_boolean()));
        let deaths: u64 = rows.iter().map(|r|r["deaths"].as_u64().unwrap()).sum();
        assert_eq!(deaths,demo.rounds.iter().flat_map(|r|&r.events).filter(|e|e.kind=="kill").count() as u64);
        println!("HQ metrics: {} named player-rounds; {} deaths; no replay state mutation",rows.len(),deaths);
    }
    #[test]
    #[ignore]
    fn cached_replay_reopens_without_original_file() {
        let fixture = std::env::var("CSTRACKER_LIBRARY_TEST_FIXTURE").expect("set fixture path");
        let mut demo: ImportedDemo = serde_json::from_slice(&fs::read(fixture).unwrap()).unwrap();
        let test_root = std::env::current_dir()
            .unwrap()
            .join("target")
            .join(format!(
                "library-test-{}",
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
        fs::create_dir_all(&test_root).unwrap();
        let source = test_root.join("source.dem");
        fs::write(&source, b"test fingerprint").unwrap();
        save(&test_root, &source, &mut demo).unwrap();
        let listed = entries(&test_root).unwrap();
        assert_eq!(listed.len(), 1);
        let restored = find_cached(&test_root, &source).unwrap().unwrap();
        assert_eq!(restored.rounds.len(), demo.rounds.len());
        assert_eq!(restored.rounds[0].frames.len(), demo.rounds[0].frames.len());
        fs::write(&source, b"different source contents").unwrap();
        assert!(find_cached(&test_root, &source).unwrap().is_none());
        fs::remove_file(&source).unwrap();
        let reopened = load(&test_root, &listed[0].id).unwrap();
        assert_eq!(reopened.summary.file_name, demo.summary.file_name);
        assert!(reopened.summary.library_id.is_some());
    }
    #[test]
    fn rejects_path_traversal() {
        assert!(load(Path::new("."), "../secret").is_err());
    }
}
