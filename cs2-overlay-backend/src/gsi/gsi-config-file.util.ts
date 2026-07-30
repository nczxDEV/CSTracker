/**
 * Generates the CS2 Game State Integration configuration file.
 *
 * *** COMPLIANCE - DO NOT MODIFY without reading the warning in the
 * GsiService header! ***
 * The `allplayers_position`, `allplayers_state`, `allplayers_weapons` and
 * `player_weapons` fields are INTENTIONALLY set to "0" - enabling them
 * would allow reading other players' position/health state, which would
 * result in a wallhack-like feature. This project explicitly and
 * permanently excludes that.
 */
export function buildGsiConfigFile(options: { token: string; port: number }): string {
  const { token, port } = options;
  return `"CS Tracker Integration"
{
    "uri"       "http://127.0.0.1:${port}/gsi"
    "timeout"   "5.0"
    "buffer"    "0.1"
    "throttle"  "0.5"
    "heartbeat" "30.0"
    "auth"
    {
        "token" "${token}"
    }
    "data"
    {
        "provider"                    "1"
        "map"                         "1"
        "round"                       "1"
        "player_id"                   "1"
        "player_state"                "1"
        "player_match_stats"          "1"
        "player_weapons"              "0"
        "allplayers_id"               "1"
        "allplayers_match_stats"      "1"
        "allplayers_state"            "0"
        "allplayers_position"         "0"
        "allplayers_weapons"          "0"
    }
}
`;
}
