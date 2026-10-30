
loadWork(); recompute();
(function () { const h = location.hash.slice(1); if (['build', 'deploy', 'simulate'].includes(h)) ST.mode = h; })();
render(); initLibrary();
