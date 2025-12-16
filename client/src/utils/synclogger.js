const { v4: uuidv4 } = require('uuid');
class SyncLogger {
  constructor(supabase) {
    this.supabase = supabase;
    this.syncRunId = uuidv4(); // Unique ID for this sync run
    this.startTime = new Date();
  }

  async log(level, message, metadata = {}) {
    // Console output with emoji
    console.log(message);
    
    // Database log (non-blocking to not slow down sync)
    this.writeToDb(level, message, metadata).catch(err => 
      console.error('⚠️ Failed to write log to database:', err)
    );
  }

  async writeToDb(level, message, metadata) {
    try {
      await this.supabase
        .from('api_sync_log')
        .insert({
          sync_run_id: this.syncRunId,
          level: level,
          message: message,
          metadata: metadata,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      // Silently fail - don't disrupt the sync process
      console.error('Log write failed:', error.message);
    }
  }

  async logMatchDataSyncStart(matchCount) {
    await this.log('info', `🚀 Starting sync run`, {
      match_count: matchCount,
      sync_run_id: this.syncRunId
    });
  }

  async logSquadSyncStart(squadCount) {
    await this.log('info', `🚀 Starting Squad sync run`, {
      squad_count: squadCount,
      sync_run_id: this.syncRunId
    });
  }

  async logMatchListSyncStart(matchCount) {
    await this.log('info', `🚀 Starting Match List sync run`, {
      match_count: matchCount,
      sync_run_id: this.syncRunId
    });
  }

  async logSyncComplete(stats) {
    const duration = (new Date() - this.startTime) / 1000;
    await this.log('info', `🎉 Sync completed`, {
      ...stats,
      duration_seconds: duration,
      sync_run_id: this.syncRunId
    });
  }

  async logMatchStart(match) {
    await this.log('info', `🏏 Processing match: ${match.match_name}`, {
      match_id: match.id,
      match_name: match.match_name,
      tournament_id: match.tournament_id,
      match_type: match.type_match
    });
  }

  async logMatchComplete(match, matchStatus, stats) {
    await this.log('info', `✅ Match processing complete: ${match.match_name}`, {
      match_id: match.id,
      match_status: matchStatus,
      ...stats
    });
  }

  async logApiCall(matchId, success, statusCode = null) {
    await this.log(
      success ? 'info' : 'error',
      success 
        ? `📡 Successfully fetched scorecard for match ${matchId}`
        : `❌ API call failed for match ${matchId}`,
      {
        match_id: matchId,
        success: success,
        status_code: statusCode
      }
    );
  }

  async logNoScorecard(matchId) {
    await this.log('info', `ℹ️ No scorecard data found for match ${matchId}`, {
      match_id: matchId,
      reason: 'no_scorecard_data'
    });
  }

  async logPlayerProcessing(action, playerName, playerId, matchId, success, stats = {}) {
    await this.log(
      success ? 'info' : 'error',
      success 
        ? `✅ Successfully ${action}: ${playerName}`
        : `❌ Failed to ${action}: ${playerName}`,
      {
        action: action,
        player_name: playerName,
        player_id: playerId,
        match_id: matchId,
        success: success,
        ...stats
      }
    );
  }

  async logError(context, error, metadata = {}) {
    await this.log('error', `❌ Error in ${context}: ${error.message}`, {
      context: context,
      error_message: error.message,
      error_stack: error.stack,
      ...metadata
    });
  }
}

module.exports = SyncLogger;