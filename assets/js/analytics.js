/* 统计：自建 Umami。仅正式域名发送；脚本未就绪时先排队，失败不影响页面。 */
(function () {
  if (location.hostname !== 'shinki1108.com') return;
  var pending = [];
  function flush() {
    var t = window.umami;
    if (!t || !t.track) return;
    pending.splice(0).forEach(function (p) {
      try { Promise.resolve(t.track(function (base) { return Object.assign({}, base, p); })).catch(function () {}); } catch (_) {}
    });
  }
  window.shinkiTrack = function (name, data) {
    var d = {};
    Object.keys(data || {}).forEach(function (k) {
      var v = data[k];
      d[k] = typeof v === 'string' ? v.slice(0, 500) : v;
    });
    pending.push({ url: location.pathname, title: document.title, name: name, data: d });
    if (pending.length > 100) pending.shift();
    flush();
  };
  window.addEventListener('load', function () { flush(); setTimeout(flush, 1500); });
})();
