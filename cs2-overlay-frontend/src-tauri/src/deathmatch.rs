use serde_json::{json, Value};
use std::{
    net::{SocketAddr, UdpSocket},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
static CACHE: OnceLock<Mutex<Option<(Instant, Value)>>> = OnceLock::new();
fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|error| error.to_string())
}

async fn fetch_json(request: reqwest::RequestBuilder) -> Result<Value, String> {
    request
        .send()
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())
}

async fn warmup_cards() -> Result<Vec<Value>, String> {
    let response =
        fetch_json(client()?.get("https://warmupserver.net/api/servercards/query.php")).await?;
    response["cards"]
        .as_array()
        .cloned()
        .ok_or_else(|| "Unsupported WarmupServer catalog".into())
}

fn cyber_cards(response: &Value) -> Result<Vec<Value>, String> {
    let modules = &response["data"]["modules"];
    let modes = modules["servers"]["data"]["servers"]["2"]
        .as_object()
        .ok_or("Unsupported CYBERSHOKE catalog")?;
    let locations = modules["servers_locations"]["data"].as_array();
    let mut cards = Vec::new();
    for mode in ["DM", "MULTICFGDM", "PISTOLDM", "HSDM", "AWPDM", "AIMDM"] {
        let Some(categories) = modes.get(mode).and_then(Value::as_object) else {
            continue;
        };
        for server in categories.values().filter_map(Value::as_array).flatten() {
            let (Some(host), Some(port)) = (server["ip"].as_str(), server["port"].as_u64()) else {
                continue;
            };
            let ip = format!("{host}:{port}");
            if address(&ip).is_err() {
                continue;
            }
            let location = locations.and_then(|rows| {
                rows.iter()
                    .find(|row| row["location"] == server["location"])
            });
            let region = location
                .and_then(|row| row["region"].as_str())
                .unwrap_or("");
            let city = location
                .and_then(|row| row["city"].as_str())
                .or_else(|| server["location"].as_str());
            let label = format!("#{} {mode}", server["num"].as_u64().unwrap_or(0));
            cards.push(json!({
                "ip": ip, "provider": "cybershoke", "mode": mode,
                "map": server["map"], "region": region, "city": city,
                "lines": [label, server["category"].as_str().unwrap_or("")],
                "slots_configured": server["maxplayers"], "faceit_avg": server["faceit_avg"],
                "live": { "freshness": "fresh", "age_seconds": 0, "server_current_users": server["players"] }
            }));
        }
    }
    Ok(cards)
}

async fn fetch_cyber_cards() -> Result<Vec<Value>, String> {
    let response = fetch_json(client()?.get("https://cybershoke.net/api/api/v2/main/data")).await?;
    cyber_cards(&response)
}

fn pracc_cards(response: &Value) -> Result<Vec<Value>, String> {
    let rows = response.as_array().ok_or("Unsupported PRACC catalog")?;
    Ok(rows.iter().filter_map(|server| {
        let ip = server["Address"].as_str()?;
        let mode = server["Mode"].as_str()?;
        if server["Game"] != "cs2" || !mode.starts_with("dm;") || address(ip).is_err() { return None; }
        let location = server["Region"].as_str().unwrap_or("");
        let region = match location.split('-').next().unwrap_or("") {
            "eu" => "Europe", "na" => "North America", "sa" => "South America",
            "asia" => "Asia", "aus" => "Australia", _ => "Unknown",
        };
        let label = if mode.contains("multi_") { "Multi-CFG" } else { "All Weapons" };
        let players: Vec<Value> = server["Players"].as_array().into_iter().flatten()
            .map(|p| json!({"name":p["Nickname"]})).collect();
        Some(json!({"ip":ip,"provider":"pracc","mode":label,"map":server["MapName"],
            "region":region,"city":location,"lines":[location,label],"roster":players,
            "slots_configured":server["MaxPlayers"],
            "live":{"freshness":"fresh","age_seconds":0,
                "server_current_users":server["NumPlayersLive"],"server_total_shown_slots":server["MaxPlayers"]}}))
    }).collect())
}

async fn fetch_pracc_cards() -> Result<Vec<Value>, String> {
    pracc_cards(&fetch_json(client()?.get("https://pracc.com/api/csgo/deathmatch/servers")).await?)
}

async fn catalog() -> Result<Value, String> {
    let cache = CACHE.get_or_init(|| Mutex::new(None));
    if let Some((at, value)) = &*cache.lock().map_err(|error| error.to_string())? {
        if at.elapsed() < Duration::from_secs(30) {
            return Ok(value.clone());
        }
    }
    let cyber = tauri::async_runtime::spawn(fetch_cyber_cards());
    let pracc = tauri::async_runtime::spawn(fetch_pracc_cards());
    let warmup = warmup_cards().await;
    let cyber = cyber
        .await
        .map_err(|error| error.to_string())
        .and_then(|result| result);
    let pracc = pracc.await.map_err(|error| error.to_string()).and_then(|result| result);
    let errors = json!({"warmup": warmup.as_ref().err(), "cybershoke": cyber.as_ref().err(), "pracc":pracc.as_ref().err()});
    if warmup.is_err() && cyber.is_err() && pracc.is_err() {
        return Err(format!("Providers are unavailable: {errors}"));
    }
    let mut cards = warmup.unwrap_or_default();
    cards.extend(cyber.unwrap_or_default());
    cards.extend(pracc.unwrap_or_default());
    let value = json!({"cards":cards,"errors":errors});
    *cache.lock().map_err(|error| error.to_string())? = Some((Instant::now(), value.clone()));
    Ok(value)
}
fn address(raw: &str) -> Result<SocketAddr, String> {
    let a: SocketAddr = raw.parse().map_err(|_| "Invalid server address")?;
    match a.ip() {
        std::net::IpAddr::V4(ip)
            if !ip.is_private()
                && !ip.is_loopback()
                && !ip.is_link_local()
                && !ip.is_unspecified()
                && !ip.is_multicast()
                && ip.octets()[0] != 0
                && ip.octets()[0] < 224
                && a.port() > 0 =>
        {
            Ok(a)
        }
        _ => Err("Only public IPv4 game servers are supported".into()),
    }
}
async fn allowed(raw: &str) -> Result<(SocketAddr, bool), String> {
    let endpoint = address(raw)?;
    let catalog = catalog().await?;
    let card = catalog["cards"]
        .as_array()
        .and_then(|cards| cards.iter().find(|card| card["ip"].as_str() == Some(raw)))
        .ok_or("Server is not in the provider catalog")?;
    Ok((endpoint, card["provider"] == "cybershoke"))
}
fn query(a: SocketAddr, mut request: Vec<u8>) -> Result<Vec<u8>, String> {
    let s = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    s.connect(a).map_err(|e| e.to_string())?;
    s.set_read_timeout(Some(Duration::from_millis(1500)))
        .map_err(|e| e.to_string())?;
    for _ in 0..2 {
        s.send(&request).map_err(|e| e.to_string())?;
        let mut b = [0u8; 65507];
        let n = s
            .recv(&mut b)
            .map_err(|_| "Server did not answer the query".to_string())?;
        if n >= 9 && b[..5] == [255, 255, 255, 255, 65] {
            if request.get(4) == Some(&85) {
                request.truncate(5);
            }
            request.extend_from_slice(&b[5..9]);
            continue;
        }
        if n < 5 || b[..4] != [255, 255, 255, 255] {
            return Err("Unsupported split server reply".into());
        }
        return Ok(b[..n].to_vec());
    }
    Err("Server challenge failed".into())
}
fn string(b: &[u8], i: &mut usize) -> Result<String, String> {
    let start = *i;
    while *i < b.len() && b[*i] != 0 {
        *i += 1;
    }
    if *i >= b.len() {
        return Err("Malformed server response".into());
    }
    let s = String::from_utf8_lossy(&b[start..*i]).to_string();
    *i += 1;
    Ok(s)
}
fn info(a: SocketAddr) -> Result<Value, String> {
    let t = Instant::now();
    let b = query(a, b"\xff\xff\xff\xffTSource Engine Query\0".to_vec())?;
    let ping = t.elapsed().as_millis();
    if b[4] != 73 {
        return Err("Unsupported info reply".into());
    }
    let mut i = 6;
    let name = string(&b, &mut i)?;
    let map = string(&b, &mut i)?;
    string(&b, &mut i)?;
    string(&b, &mut i)?;
    if b.len() < i + 7 {
        return Err("Truncated server info".into());
    }
    Ok(json!({"name":name,"map":map,"players":b[i+2],"slots":b[i+3],"bots":b[i+4],"ping":ping}))
}
#[tauri::command]
pub async fn dm_catalog() -> Result<Value, String> {
    catalog().await
}
#[tauri::command]
pub async fn dm_probe(ip: String) -> Result<Value, String> {
    let (a, _) = allowed(&ip).await?;
    tauri::async_runtime::spawn_blocking(move || info(a))
        .await
        .map_err(|e| e.to_string())?
}
async fn cyber_details(endpoint: SocketAddr) -> Result<Value, String> {
    // The provider uses a POST for this read-only roster query.
    fetch_json(
        client()?
            .post("https://cybershoke.net/api/servers/data")
            .json(&json!({"ip":endpoint.ip().to_string(),"port":endpoint.port()})),
    )
    .await
}

async fn cyber_players(endpoint: SocketAddr) -> Result<Value, String> {
    let response = cyber_details(endpoint).await?;
    let rows = response
        .pointer("/data/players/list")
        .and_then(Value::as_array)
        .or_else(|| response["playersv2"].as_array())
        .ok_or("CYBERSHOKE player list unavailable")?;
    let players: Vec<Value> = rows.iter().map(|player| json!({
        "name": player["name"], "seconds": player["time"], "faceitLevel": player["faceit_level"],
        "kills": player["kills"], "deaths": player["deaths"], "headshots": player["headshots"],
        "kd": player["kd"], "hs": player["hs"], "ttk": player["ttk"]
    })).collect();
    Ok(json!(players))
}

#[tauri::command]
pub async fn dm_players(ip: String) -> Result<Value, String> {
    let (a, cyber) = allowed(&ip).await?;
    if cyber {
        return cyber_players(a).await;
    }
    let snapshot = catalog().await?;
    if let Some(card) = snapshot["cards"].as_array().and_then(|cards| cards.iter()
        .find(|card| card["ip"].as_str() == Some(&ip) && card["provider"] == "pracc")) {
        return Ok(card["roster"].clone());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let b=query(a,vec![255,255,255,255,85,255,255,255,255])?;if b.len()<6||b[4]!=68{return Err("Player list unavailable".into());}let mut i=6;let mut rows=vec![];for _ in 0..b[5]{if i>=b.len(){return Err("Incomplete player list".into());}i+=1;let name=string(&b,&mut i)?;if i+8>b.len(){return Err("Incomplete player list".into());}let score=i32::from_le_bytes(b[i..i+4].try_into().unwrap());let duration=f32::from_le_bytes(b[i+4..i+8].try_into().unwrap());i+=8;rows.push(json!({"name":name,"score":score,"seconds":if duration.is_finite(){duration.max(0.0)}else{0.0}}));}Ok(json!(rows))
    }).await.map_err(|error| error.to_string())?
}
#[tauri::command]
pub async fn dm_join(app: AppHandle, ip: String, min_free: u8) -> Result<(), String> {
    let (a, cyber) = allowed(&ip).await?;
    let (slots, players) = if cyber {
        let details = cyber_details(a).await?;
        let server = &details["data"]["server"];
        (server["max_players"].as_u64(), server["players"].as_u64())
    } else {
        let info = tauri::async_runtime::spawn_blocking(move || info(a))
            .await
            .map_err(|e| e.to_string())??;
        (info["slots"].as_u64(), info["players"].as_u64())
    };
    let free = slots
        .zip(players)
        .map(|(slots, players)| slots.saturating_sub(players))
        .ok_or("Server capacity unavailable")?;
    if free < u64::from(min_free.max(1)) {
        return Err(
            "No longer enough reported free slots. Refresh and choose another server.".into(),
        );
    }
    app.opener()
        .open_url(format!("steam://connect/{a}"), None::<&str>)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn open_deathmatch(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("deathmatch") {
        w.show().map_err(|e| e.to_string())?;
        return w.set_focus().map_err(|e| e.to_string());
    }
    tauri::WebviewWindowBuilder::new(
        &app,
        "deathmatch",
        tauri::WebviewUrl::App("deathmatch.html".into()),
    )
    .title("CS Tracker · Deathmatch Finder")
    .inner_size(1280.0, 850.0)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pracc_catalog_filters_and_preserves_unknown_stats() {
        let server = json!({"Address":"8.8.8.8:27015","Game":"cs2","Mode":"dm;multi_pmr",
            "Region":"eu-de","MaxPlayers":24,"NumPlayersLive":2,"MapName":"de_mirage",
            "Players":[{"Nickname":"Player","IsPro":true},{"Nickname":""}]});
        let mut private = server.clone(); private["Address"] = json!("127.0.0.1:27015");
        let mut retake = server.clone(); retake["Mode"] = json!("retake");
        let cards = pracc_cards(&json!([server,private,retake])).unwrap();
        assert_eq!(cards.len(),1);
        assert_eq!(cards[0]["region"],"Europe");
        assert_eq!(cards[0]["mode"],"Multi-CFG");
        assert_eq!(cards[0]["roster"][0]["name"],"Player");
        assert!(cards[0]["roster"][0]["faceitLevel"].is_null());
        assert!(pracc_cards(&json!({})).is_err());
    }
    #[test]
    fn addresses() {
        for s in [
            "127.0.0.1:80",
            "10.0.0.1:27015",
            "[::1]:27015",
            "0.1.2.3:80",
            "8.8.8.8:0",
        ] {
            assert!(address(s).is_err());
        }
        assert!(address("94.199.215.74:28715").is_ok());
    }
    #[test]
    fn truncated_string() {
        assert!(string(b"abc", &mut 0).is_err());
    }
}

#[cfg(test)]
mod live_tests {
    use super::*;
    #[test]
    #[ignore]
    fn public_catalog() {
        let v = tauri::async_runtime::block_on(catalog()).unwrap();
        let cards = v["cards"].as_array().unwrap();
        assert!(!cards.is_empty());
        let valid = cards
            .iter()
            .filter(|c| {
                c["ip"]
                    .as_str()
                    .map(|s| address(s).is_ok())
                    .unwrap_or(false)
            })
            .count();
        println!(
            "Public provider catalog: {} cards, {} valid public endpoints",
            cards.len(),
            valid
        );
        assert!(valid > 0);
        let pracc: Vec<_> = cards.iter().filter(|card| card["provider"] == "pracc").collect();
        assert!(!pracc.is_empty(), "PRACC error: {}", v["errors"]["pracc"]);
        println!("PRACC: {} DM servers, {} named players", pracc.len(), pracc.iter()
            .flat_map(|card| card["roster"].as_array().into_iter().flatten())
            .filter(|player| player["name"].as_str().is_some_and(|name| !name.trim().is_empty())).count());
        let cyber: Vec<_> = cards
            .iter()
            .filter(|card| card["provider"] == "cybershoke")
            .collect();
        assert!(
            !cyber.is_empty(),
            "CYBERSHOKE error: {}",
            v["errors"]["cybershoke"]
        );
        let populated = cyber
            .iter()
            .find(|card| {
                card["live"]["server_current_users"].as_u64().unwrap_or(0) >= 10
                    && card["faceit_avg"].as_u64().unwrap_or(0) > 0
            })
            .expect("Populated CYBERSHOKE DM server");
        let endpoint = address(populated["ip"].as_str().unwrap()).unwrap();
        let players = tauri::async_runtime::block_on(cyber_players(endpoint)).unwrap();
        let rows = players.as_array().unwrap();
        assert!(rows.iter().any(|row| row["faceitLevel"].as_u64().is_some()));
        assert!(rows.iter().any(|row| row["kills"].as_u64().is_some()));
        println!(
            "CYBERSHOKE: {} DM endpoints, tested roster with {} rows",
            cyber.len(),
            rows.len()
        );
        println!("Sample direct UDP query: {}", info(endpoint).is_ok());
    }
}
