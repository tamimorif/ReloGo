// Error text is authored here rather than copied from Auth/PostgREST responses:
// provider messages can include submitted values, SQL detail, or identifiers.
export const ADMIN_ERRORS = {
  signIn: "Unable to sign in. Check your credentials and connection, then try again.",
  loadAlerts: "Unable to load alerts. Refresh to try again.",
  dismissAlert: "Unable to dismiss this alert. Refresh the alerts before trying again.",
  loadWaitlist: "Unable to load the waitlist. Refresh to try again.",
  loadThreads: "Unable to load support threads. Refresh to try again.",
  loadUsers: "Unable to load users. Refresh to try again.",
  loadUserDetail: "Unable to load this user. Close and reopen the details to try again.",
  loadRule: "Unable to load this rule. Close and reopen the alert to try again.",
  approveRule: "Unable to approve this rule. Close and refresh the alerts before trying again.",
  loadThread: "Unable to load this thread. Close and reopen it to try again.",
  loadMessages: "Unable to load the messages. Close and reopen the thread to try again.",
  takeOverThread: "Unable to take over this thread. Close and reopen it before trying again.",
  resolveThread: "Unable to resolve this thread. Close and reopen it before trying again.",
  sendReply: "Unable to confirm that your reply was sent. Reopen the thread and check before sending again.",
  updateRepliedThread: "Your reply was sent, but the thread status could not be updated. Reopen the thread to check its status.",
} as const;
