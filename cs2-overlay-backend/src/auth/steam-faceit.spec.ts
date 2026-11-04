import { SteamFaceitService } from './steam-faceit.service';
describe('Steam-resolved FACEIT identity',()=>{
  function setup(){
    const rows:any={steam:{providerUserId:'steam',avatarUrl:'https://avatar.test/a'}};
    const accounts:any={getPublicView:(p:string)=>rows[p]||null,save:jest.fn((p:any)=>rows[p.provider]=p),unlink:jest.fn((p:string)=>delete rows[p])};
    const client:any={getPlayerBySteamId:jest.fn(async()=>({player_id:'faceit',nickname:'Player'}))};
    return {rows,accounts,client,service:new SteamFaceitService(accounts,client)};
  }
  it('resolves by Steam ID, persists presentation data without tokens and bounds requests',async()=>{
    const b=setup();await b.service.refresh();await b.service.refresh();expect(b.client.getPlayerBySteamId).toHaveBeenCalledTimes(1);expect(b.client.getPlayerBySteamId).toHaveBeenCalledWith('steam');expect(b.rows.faceit.extra.identitySource).toBe('steam-data-api');expect(b.rows.faceit.avatarUrl).toBe(b.rows.steam.avatarUrl);expect(b.rows.faceit.accessToken).toBeUndefined();
  });
  it('removes derived identity after logout',async()=>{const b=setup();await b.service.refresh();delete b.rows.steam;await b.service.refresh();expect(b.rows.faceit).toBeUndefined();});
  it('never saves a late response after account switch',async()=>{const b=setup();b.client.getPlayerBySteamId.mockImplementation(async()=>{b.rows.steam={providerUserId:'other'};return {player_id:'old'};});await b.service.refresh();expect(b.accounts.save).not.toHaveBeenCalled();});
  it('leaves missing profiles unavailable',async()=>{const b=setup();b.client.getPlayerBySteamId.mockResolvedValue(null);await b.service.refresh();expect(b.accounts.save).not.toHaveBeenCalled();});
  it('preserves matching persisted identity during API failure',async()=>{const b=setup();const profile={providerUserId:'cached',extra:{identitySource:'steam-data-api',steamId:'steam'}};b.rows.faceit=profile;b.client.getPlayerBySteamId.mockRejectedValue(new Error('offline'));await b.service.refresh();expect(b.rows.faceit).toBe(profile);});
});
