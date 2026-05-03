/**
 * Simple event tracking logger.
 * Sends to console in dev; can be swapped for Segment/Mixpanel/PostHog.
 */

const isDev = import.meta.env.DEV;

const EVENTS = {
  ROLE_SELECTED:         "role_selected",
  ONBOARDING_COMPLETED:  "onboarding_completed",
  UPGRADE_CLICKED:       "upgrade_clicked",
  FEATURE_BLOCKED:       "feature_blocked",
  PLAN_UPGRADED:         "plan_upgraded",
  LIMIT_REACHED:         "limit_reached",
  CHECKLIST_DISMISSED:   "checklist_dismissed",
  CHECKLIST_ITEM_DONE:   "checklist_item_done",
};

function track(event, props = {}) {
  const payload = {
    event,
    timestamp: new Date().toISOString(),
    ...props,
  };

  if (isDev) {
    console.info("[Analytics]", payload);
  }

  // TODO: forward to analytics provider in production
  // e.g. window.analytics?.track(event, props);
}

export const analytics = {
  roleSelected:        (role)           => track(EVENTS.ROLE_SELECTED,        { role }),
  onboardingCompleted: (role)           => track(EVENTS.ONBOARDING_COMPLETED,  { role }),
  upgradeClicked:      (from, to, src)  => track(EVENTS.UPGRADE_CLICKED,       { from, to, source: src }),
  featureBlocked:      (feature, plan)  => track(EVENTS.FEATURE_BLOCKED,       { feature, plan }),
  planUpgraded:        (plan)           => track(EVENTS.PLAN_UPGRADED,          { plan }),
  limitReached:        (limit, plan)    => track(EVENTS.LIMIT_REACHED,          { limit, plan }),
  checklistDismissed:  ()               => track(EVENTS.CHECKLIST_DISMISSED),
  checklistItemDone:   (item)           => track(EVENTS.CHECKLIST_ITEM_DONE,    { item }),
};
