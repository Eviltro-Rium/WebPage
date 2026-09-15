/* Deployment-specific online settings.  This is intentionally kept in the
 * administrator-controlled deployment files; players do not edit the
 * signaling endpoint in the lobby.
 */
(function (global) {
    if (!global.FURRY_SIGNAL_URL) {
        // Production custom domain configured on the signaling Worker.
        // The client converts this HTTP URL to WSS automatically for rooms.
        global.FURRY_SIGNAL_URL = 'https://signal.riumfurry.com/online-signal';
    }
})(window);
