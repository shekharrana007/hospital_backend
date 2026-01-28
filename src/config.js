// Basic configuration for the OPD Token Allocation Engine
module.exports = {
  port: process.env.PORT || 4000,
  dbFile: 'opd-db.json',
  // Priority scores: higher number = higher priority
  priorities: {
    EMERGENCY: 5,
    PAID: 4,
    FOLLOW_UP: 3,
    ONLINE: 2,
    WALK_IN: 1
  },
  tokenSources: ['EMERGENCY', 'PAID', 'FOLLOW_UP', 'ONLINE', 'WALK_IN']
};


