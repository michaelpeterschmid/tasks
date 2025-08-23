//v3
const appShellAssets = "site-static-v2";
const dynamicCache = "site-dynamic-v2";
const assets = [
    "./", //we want to store the results of requests in the cache
    "./#",
    "./pages/history.html",
    "./index.html",
    "./js/addTask.js",
    "./js/history.js",
    "./js/modal.js",
    "./manifest.json",
    "./img/icons/icon_96x96.png",
    "https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.colors.min.css",
    "https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.conditional.indigo.min.css",
    "./offline.html"

    /*The above line would be in a html link href tag in the meta section of index.html
    since it sees that we have stored it in side-static it will try get it locally instead of from remote.  */
];


//cache limit size function
const limitCacheSize = (name, size) => {
    caches.open(name).then(cache => {
        cache.keys().then(keys => {
            if(keys.length > size){
                cache.delete(keys[0]).then(limitCacheSize(name, size)); //delete keys and recall function until condition is no longer true.
            }
        })
    })
}

// install service worker
self.addEventListener("install", evt => {
    console.log("service worker has been installed");

    //waites until promise is resolved before edding install event. So caching is certainly finished before service worker is closed.
    evt.waitUntil(
        caches.open(appShellAssets).then(cache => { //open cache if exist or create and open if not exits
            console.log("caching shell assets")
            cache.addAll(assets);
    }))
});

//activate event
self.addEventListener("activate", evt => {
    evt.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(keys         //promises yields success if substaks have success
                .filter(key => key !== appShellAssets && key !== dynamicCache)
                .map(key => caches.delete(key)) //delete each old cache.
            )
        } )
    )
});


// fetch event that fires everytime there is a fetch request
self.addEventListener("fetch", evt => {
    
    //console.log("fetch event", evt)
    //here we need to intercept fetch requests by checking if they are in our cache.
    evt.respondWith(
        caches.match(evt.request).then(chacheRes => {
            return chacheRes || fetch(evt.request).then(fetchRes => {
                    return caches.open(dynamicCache).then(cache => {
                        cache.put(evt.request.url, fetchRes.clone());
                        limitCacheSize(dynamicCache, 24)
                        return fetchRes;
                })
            })
        }).catch(() => {
            if(evt.request.url.indexOf(".html") > -1 ){
                return caches.match("./offline.html");
            }
        })
    );
})
