import { PlayersService } from './players.service';
describe('Player HQ FACEIT identity resolution',()=>{
  it('resolves FACEIT GUID as player ID, never nickname',async()=>{
    const id='cc41289b-ba38-4504-b5f0-9aaa4808de6b';
    const client={getPlayerById:jest.fn(async()=>({player_id:id})),getPlayerByNickname:jest.fn()};
    const service:any=Object.create(PlayersService.prototype);service.faceitClient=client;
    expect((await service.resolveFaceitPlayerOnly(id)).player_id).toBe(id);
    expect(client.getPlayerById).toHaveBeenCalledWith(id);expect(client.getPlayerByNickname).not.toHaveBeenCalled();
  });
});
