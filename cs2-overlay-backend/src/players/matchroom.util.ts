/**
 * "Load from Matchroom" feature - parses a FACEIT match ID straight out
 * of a matchroom URL, so the user never has to hunt down/copy a raw ID.
 *
 * Matchroom URLs look like:
 *   https://www.faceit.com/en/cs2/room/1-2acd9f19-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *   https://www.faceit.com/en/cs2/room/1-2acd9f19-xxxx-xxxx-xxxx-xxxxxxxxxxxx/scoreboard
 *   https://www.faceit.com/de/csgo/room/1-2acd9f19-xxxx-xxxx-xxxx-xxxxxxxxxxxx?tab=overview
 * (language segment and game slug both vary; the match ID is always the
 * path segment right after "/room/").
 */
const MATCHROOM_URL_REGEX = /faceit\.com\/[a-z-]+\/(?:cs2|csgo)\/room\/([^/?#]+)/i;

/**
 * Extracts a FACEIT match ID from either a full matchroom URL or an
 * already-raw match ID (e.g. if a user pastes just the ID directly) -
 * returns the trimmed, decoded ID either way.
 */
export function parseMatchroomInput(input: string): string {
  const trimmed = (input || '').trim();
  const match = MATCHROOM_URL_REGEX.exec(trimmed);
  if (match) {
    return decodeURIComponent(match[1]);
  }
  // Not a recognizable matchroom URL - assume the user pasted the raw
  // match ID directly (advanced use case), used as-is.
  return trimmed;
}
