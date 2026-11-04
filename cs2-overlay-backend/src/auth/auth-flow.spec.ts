import { of } from 'rxjs';
import { SteamAuthService } from './steam-auth.service';
import { FaceitOAuthService } from './faceit-oauth.service';
import { AuthController } from './auth.controller';
import { OAuthStateService } from './oauth-state.service';

describe('local account login flows',()=>{
  const steamId='76561198000000000';
  let attempts:Map<string,any>,state:any,http:any,linked:any,config:any,steam:SteamAuthService;
  beforeEach(()=>{
    attempts=new Map();state={create:jest.fn((provider:string)=>{attempts.set('nonce',{provider,codeVerifier:'verifier'});return 'nonce';}),consume:jest.fn((provider:string,key:string)=>{const v=attempts.get(key);attempts.delete(key);return v?.provider===provider?v:null;}),cancel:jest.fn(()=>attempts.clear())};
    http={post:jest.fn(()=>of({data:'is_valid:true\n'})),get:jest.fn()};linked={save:jest.fn(),unlink:jest.fn(),getPublicView:jest.fn(()=>null)};
    config={get:jest.fn((key:string,fallback:any)=>({'host':'127.0.0.1','port':3000}[key]??fallback))};
    steam=new SteamAuthService(http,config,state,linked,{getPlayerSummary:jest.fn(()=>Promise.resolve(null))} as any);
  });
  function callback(){return {state:'nonce','openid.mode':'id_res','openid.op_endpoint':'https://steamcommunity.com/openid/login','openid.identity':`https://steamcommunity.com/openid/id/${steamId}`,'openid.claimed_id':`https://steamcommunity.com/openid/id/${steamId}`,'openid.return_to':'http://127.0.0.1:3000/auth/steam/callback?state=nonce'};}
  it('creates loopback callback, verifies Steam assertion, saves identity and rejects replay',async()=>{
    const url=new URL(steam.buildLoginUrl());expect(url.searchParams.get('openid.return_to')).toBe(callback()['openid.return_to']);
    await expect(steam.handleCallback(callback())).resolves.toBe(steamId);expect(http.post).toHaveBeenCalledTimes(1);expect(linked.save.mock.calls[0][0].accessToken).toBeNull();
    await expect(steam.handleCallback(callback())).rejects.toThrow('state mismatch');
  });
  it('handles cancellation, wrong callback and server rejection without linking',async()=>{
    steam.buildLoginUrl();await expect(steam.handleCallback({...callback(),'openid.mode':'cancel'})).rejects.toThrow('cancelled');
    steam.buildLoginUrl();await expect(steam.handleCallback({...callback(),'openid.return_to':'http://other/'})).rejects.toThrow('does not match');
    steam.buildLoginUrl();http.post.mockReturnValue(of({data:'is_valid:false'}));await expect(steam.handleCallback(callback())).rejects.toThrow('rejected');expect(linked.save).not.toHaveBeenCalled();
  });
  it('exposes missing FACEIT OAuth configuration separately from linked identity; cancels attempts',async()=>{
    const faceit=new FaceitOAuthService(http,config,state,linked,{} as any);expect(faceit.isConfigured).toBe(false);
    const controller=new AuthController(faceit,steam,linked,{} as any,state,{refresh:async()=>{}} as any);
    expect((await controller.getStatus()).capabilities).toEqual({steam:true,faceit:false});expect(()=>controller.faceitLogin()).toThrow('not configured');
    steam.buildLoginUrl();controller.cancelLogin('steam');expect(attempts.size).toBe(0);controller.unlink('steam');expect(linked.unlink).toHaveBeenCalledWith('steam');
  });
  it('FACEIT code exchange uses PKCE and rejects reused state',async()=>{
    const values:any={'faceitOAuth.clientId':'client','faceitOAuth.clientSecret':'secret','faceitOAuth.redirectUri':'https://example.test/callback','faceitOAuth.authorizeUrl':'https://accounts.faceit.com/oauth/authorize','faceitOAuth.tokenUrl':'https://api.faceit.com/auth/v1/oauth/token','faceitOAuth.userInfoUrl':'https://api.faceit.com/auth/v1/resources/userinfo'};
    config.get.mockImplementation((k:string)=>values[k]);http.post.mockReturnValue(of({data:{access_token:'test-token'}}));http.get.mockReturnValue(of({data:{sub:'player',nickname:'Player'}}));
    const faceit=new FaceitOAuthService(http,config,state,linked,{getPlayerByNickname:jest.fn(()=>Promise.resolve(null))} as any);
    const url=new URL(faceit.buildAuthorizeUrl());expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    await faceit.handleCallback('code','nonce');expect(http.post.mock.calls[0][1]).toContain('code_verifier=verifier');expect(linked.save).toHaveBeenCalled();await expect(faceit.handleCallback('code','nonce')).rejects.toThrow('state mismatch');
  });
  it('persisted state is consumable by a fresh service instance, once, and expires',()=>{
    const rows=new Map<string,any>();const db:any={connection:{prepare:(sql:string)=>({run:(...args:any[])=>{if(sql.startsWith('INSERT'))rows.set(args[0],{state:args[0],provider:args[1],code_verifier:args[2],created_at:args[3]});if(sql.includes('WHERE state = ?'))rows.delete(args[0]);},get:(key:string)=>rows.get(key)})}};
    const first=new OAuthStateService(db),nonce=first.create('steam');expect(new OAuthStateService(db).consume('steam',nonce)).toEqual({codeVerifier:null});expect(first.consume('steam',nonce)).toBeNull();
    const stale=first.create('steam');rows.get(stale).created_at='2000-01-01';expect(first.consume('steam',stale)).toBeNull();
  });
});
