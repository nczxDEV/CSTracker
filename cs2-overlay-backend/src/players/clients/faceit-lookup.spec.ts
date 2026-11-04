import { FaceitClient } from './faceit.client';
import { of, throwError } from 'rxjs';

function client(responses: any[]) {
  const get=jest.fn((url: string, options?: any)=>{const next=responses.shift();return next?.error?throwError(()=>({response:{status:next.error}})):of({data:next});});
  return {get,service:new FaceitClient({get} as any,{get:()=> 'https://open.faceit.com/data/v4'} as any,{getFaceitApiKey:()=> 'test-key'} as any)};
}
describe('FACEIT exact nickname casing',()=>{
  it('resolves lowercase input to the unique exact nickname without picking fuzzy results',async()=>{
    const {get,service}=client([{error:404},{items:[{nickname:'McMacsu2',player_id:'wrong'},{nickname:'McMacsu',player_id:'right'}]},{nickname:'McMacsu',player_id:'right'}]);
    expect((await service.getPlayerByNickname('mcmacsu')).player_id).toBe('right');expect(get.mock.calls[2][0]).toContain('/players/right');
  });
  it('does not substitute a fuzzy or ambiguous match',async()=>{
    for(const items of [[{nickname:'someoneElse',player_id:'a'}],[{nickname:'Name',player_id:'a'},{nickname:'NAME',player_id:'b'}]]){
      const {get,service}=client([{error:404},{items}]);expect(await service.getPlayerByNickname('name')).toBeNull();expect(get).toHaveBeenCalledTimes(2);
    }
  });
  it('keeps the successful direct lookup to one request',async()=>{const {get,service}=client([{nickname:'McMacsu'}]);expect((await service.getPlayerByNickname('McMacsu')).nickname).toBe('McMacsu');expect(get).toHaveBeenCalledTimes(1);});
  it('reports rejected keys rather than claiming the player is missing',async()=>{const {service}=client([{error:401}]);await expect(service.getPlayerByNickname('name')).rejects.toMatchObject({response:{error:'FACEIT_KEY_REJECTED'}});});
});
