public class DailySummaryService
{
    private readonly IPriceBroadcaster _broadcaster;
    private readonly ILogger<DailySummaryService> _logger;

    public DailySummaryService(IPriceBroadcaster broadcaster, ILogger<DailySummaryService> logger)
    {
        _broadcaster = broadcaster;
        _logger = logger;
    }

    public Task GenerateDailySummary()
    {
        var close = _broadcaster.LatestPrice;
        _logger.LogInformation("BTC/USDT Daily Summary: Close = ${Close}", close);
        return Task.CompletedTask; // Return directly, do not await
    }
}