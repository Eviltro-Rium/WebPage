/* Deployment-specific online settings.  Keep the input editable so a
 * staging Worker or a same-origin /online-signal route can still override it.
 */
(function (global) {
    if (!global.FURRY_SIGNAL_URL) {
        // Production custom domain configured on the signaling Worker.
        // The client converts this HTTP URL to WSS automatically for rooms.
        global.FURRY_SIGNAL_URL = 'https://signal.riumfurry.com/online-signal';
    }
})(window);
