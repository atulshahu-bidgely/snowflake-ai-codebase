import { useState, useEffect, useCallback } from 'react';
import { config } from '../config/env';

/**
 * Shape returned by the backend `GET /api/usage` endpoint.
 * All values originate from the backend .env / user_tracker.csv so the UI
 * stays in sync with the real credit deduction + reset logic.
 */
export interface UsageData {
  userId: string;
  creditsLeft: number;
  creditsUsed: number;
  creditAllowance: number;
  resetInterval: string; // minute | hour | day | week | month
  costs: {
    dataQuery: number;     // LEFT_COST
    trendAnalysis: number; // MIDDLE_COST
    targeting: number;     // RIGHT_COST
  };
}

/**
 * Fetches credits-remaining + per-question-type credit costs from the backend.
 * The costs are read from the backend .env (LEFT_COST / MIDDLE_COST / RIGHT_COST)
 * and the allowance from RESET_CREDITS.
 */
export const useUsage = () => {
  const [usage, setUsage] = useState<UsageData | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch(`${config.backendUrl}/api/usage`);
      if (res.ok) setUsage(await res.json());
    } catch {
      /* network errors are non-fatal — the popover simply won't render */
    }
  }, []);

  // Instantly patch the credits-left value (e.g. from the X-Credits-Left header
  // the server sends right after deducting), without a round-trip.
  const applyCreditsLeft = useCallback((creditsLeft: number) => {
    setUsage(prev => prev
      ? { ...prev, creditsLeft, creditsUsed: Math.max(prev.creditAllowance - creditsLeft, 0) }
      : prev);
  }, []);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  return { usage, fetchUsage, applyCreditsLeft };
};
