/* Deployment-specific online settings.  Keep the input editable so a
 * staging Worker or a same-origin /online-signal route can still override it.
 */
(function (global) {
    if (!global.FURRY_SIGNAL_URL) {
        global.FURRY_SIGNAL_URL = 'https://furry-trial-online-signal.g4dbwnb95s.workers.dev/online-signal';
    }
})(window);
