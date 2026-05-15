using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

[Authorize]
public class MarketDataHub : Hub
{
    private readonly IPriceBroadcaster _broadcaster;

    public MarketDataHub(IPriceBroadcaster broadcaster)
    {
        _broadcaster = broadcaster;
    }

    public override async Task OnConnectedAsync()
    {
        // Send current state when someone connects
        await Clients.Caller.SendAsync("PairChanged", _broadcaster.CurrentPair);
        await base.OnConnectedAsync();
    }

    public async Task SwitchPair(string pair)
    {
        // Basic validation to prevent malicious input
        if (!string.IsNullOrWhiteSpace(pair) && pair.Length < 20)
        {
            _broadcaster.CurrentPair = pair;
            await Clients.All.SendAsync("PairChanged", pair);
        }
    }
}