import { RISK_LEVELS } from './levels.js';

export function buildActionPolicy(level, context = {}) {
  const supportLevel = context.browserSupportLevel ?? 'unknown';

  if (supportLevel === 'unsupported') {
    return {
      action: 'restrict',
      challengeRequired: true,
      challengeType: 'oauth_or_sms',
      rateLimitProfile: 'locked',
      providerVisibleWarning: true,
    };
  }

  if (supportLevel === 'unknown') {
    return {
      action: 'challenge',
      challengeRequired: true,
      challengeType: 'oauth_or_sms',
      rateLimitProfile: 'strict',
      providerVisibleWarning: true,
    };
  }

  switch (level) {
    case RISK_LEVELS.TRUSTED:
      return {
        action: 'allow',
        challengeRequired: false,
        challengeType: null,
        rateLimitProfile: 'relaxed',
        providerVisibleWarning: false,
      };
    case RISK_LEVELS.NORMAL:
      return {
        action: 'allow',
        challengeRequired: false,
        challengeType: null,
        rateLimitProfile: 'default',
        providerVisibleWarning: false,
      };
    case RISK_LEVELS.REVIEW:
      return {
        action: 'challenge',
        challengeRequired: true,
        challengeType: 'oauth_or_sms',
        rateLimitProfile: 'strict',
        providerVisibleWarning: true,
      };
    case RISK_LEVELS.HIGH_RISK:
      return {
        action: 'restrict',
        challengeRequired: true,
        challengeType: 'oauth_or_sms',
        rateLimitProfile: 'locked',
        providerVisibleWarning: true,
      };
    case RISK_LEVELS.UNSCORED:
    default:
      return {
        action: 'allow',
        challengeRequired: false,
        challengeType: null,
        rateLimitProfile: 'default',
        providerVisibleWarning: false,
      };
  }
}
