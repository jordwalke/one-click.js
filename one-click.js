(function(glob) {
  function getMain() {
    var main = document.querySelector("script[data-main]");
    var main = main.dataset.main;
    if(main) {
      if (main.lastIndexOf(".js") !== -1 || main.lastIndexOf(".js") === main.length - 3) {
        if (main.indexOf("/") === -1 && main[0] !== ".") {
          main = "./" + main;
        }
      }
      return main;
    }
    return null;
  }

  var windowSetup = Object.getOwnPropertyNames(window)
    .reduce(function(cur, nm) {
      return nm[0].toUpperCase() === nm[0]
        ? cur.concat([nm + " = parent." + nm])
        : cur;
    }, [])
    .join(",");

  function printCircularDepError(wasNotLoaded) {
    // TODO: Support circular dependencies.
    var sawCircle = false;
    console.error(
      "Circular dependency or unsatisfiable module %c" +
        wasNotLoaded.relPath +
        "%c -> [" +
        Object.keys(wasNotLoaded.fieldAccessesByDependency)
          .map(function(dep) {
            return !OneClick.modulesFromRoot[dep]
              ? "empty "
              : (!sawCircle && dep === wasNotLoaded.relPath
                  ? ((sawCircle = true), "%c" + dep + "%c")
                  : dep) +
                  " -> [" +
                  Object.keys(
                    OneClick.modulesFromRoot[dep].fieldAccessesByDependency
                  )
                    .map(function(depDep) {
                      return !sawCircle && depDep === wasNotLoaded.relPath
                        ? ((sawCircle = true), "%c" + depDep + "%c")
                        : depDep;
                    })
                    .join(", ") +
                  "]";
          })
          .join(", ") +
        "]",
      "font-weight:bold; background: red; color: #ffffff",
      "font-weight:normal; background: none; color: none",
      sawCircle
        ? "font-weight:bold; background: red; color: #ffffff"
        : ". Inspect the following window.OneClick.modulesFromRoot dependency graph for cicular references. ",
      sawCircle
        ? "font-weight:normal; background: none; color: none"
        : window.OneClick.modulesFromRoot
    );
  }
  function relativizeImpl(requiringDirRelRoot, toRel) {
    if (toRel.length === 0) {
      throw ["Cannot resolve ", requiringDirRelRoot.join("/"), toRel.join("/")];
    } else if (
      toRel[0][0] == "." &&
      toRel[0][1] === "." &&
      toRel[0].length === 2
    ) {
      if (requiringDirRelRoot.length == 0) {
        return toRel;
      }
      return relativizeImpl(
        requiringDirRelRoot.slice(0, requiringDirRelRoot.length - 1),
        toRel.slice(1)
      );
    } else {
      let total = requiringDirRelRoot.concat(toRel);
      return total;
    }
  }
  var indexify = function(path) {
    var splits = path.split('/');
    if(splits.length > 0) {
      var last = splits[splits.length - 1];
      if (path.lastIndexOf(".js") !== path.length - 3) {
        return path + '/index.js';
      } else {
        return path;
      }

    }
  };
  var OneClick = {
    // Set to true to debug the module loading.
    __DEBUG__MODULE_LOADING: false,
    modulesFromRoot: {},
    onRequirable: function onRequireable(reqPath, cb) {
      var relativized = humanUsableResolve("./main.html", reqPath);
      var moduleData = OneClick.modulesFromRoot[relativized];
      if (!moduleData || moduleData.status !== 'loading') {
        (OneClick.listenersByRelPath[relativized] ||
          (OneClick.listenersByRelPath[relativized] = [])).push(cb);
        return requireScrapeRound("./main.html", reqPath);
      } else {
        return moduleData.moduleExports;
      }
    },
    onMain: function onMain(cb) {
      var main = getMain();
      if(main) {
        OneClick.onRequirable(main, cb);
      }
    },
    listenersByRelPath: {
      
    },
    resolve: function(requiringFileRelRoot, toRelativePath) {
      toRelativePath = indexify(toRelativePath);
      if(toRelativePath[0] === '.' && toRelativePath[1] === '/' ||
         toRelativePath[0] === '.' && toRelativePath[1] === '.' && toRelativePath[2] === '/') {
        var fromRelativeToRootSplit = requiringFileRelRoot.split("/");
        var toRelativePathSplit = toRelativePath.split("/");
        // Remove all relative ".". Everything will just be either ../ or
        // implicitly relative.
        var fromRelativeToRootSplit =
          fromRelativeToRootSplit[0] === '.' ? fromRelativeToRootSplit.slice(1) : fromRelativeToRootSplit;
        var toRelativePathSplit = toRelativePathSplit[0] === '.' ? toRelativePathSplit.slice(1) : toRelativePathSplit;
        var segments = relativizeImpl(
          // Remove the depending file, to leave only the dir
          fromRelativeToRootSplit.slice(0, fromRelativeToRootSplit.length - 1),
          toRelativePathSplit
        );
        return segments.join("/");
     } else {
       return 'node_modules/' + toRelativePath;
     }
    }
  };
  var canAndShouldBeLoadedNow = function(moduleData) {
    var allLoading = true;
    if (moduleData.status !== "loading") {
      for (var dep in moduleData.fieldAccessesByDependency) {
        if (OneClick.modulesFromRoot[dep].status !== "loading") {
          return null;
        }
      }
      return moduleData;
    } else {
      return null;
    }
  };
  // This time allow returning a module if its deps aren't loading yet, but
  // only as long as their backwards referenced module load-time field accesses
  // are empty.
  var canBreakCircularDependency = function(moduleData) {
    var allLoading = true;
    if (moduleData.status !== "loading") {
      for (var dep in moduleData.fieldAccessesByDependency) {
        var invalidatesAbilityToBreakCircularDependency =
          OneClick.modulesFromRoot[dep].status !== "loading" &&
          moduleData.fieldAccessesByDependency[dep].length !== 0;
        if (invalidatesAbilityToBreakCircularDependency) {
          return null;
        }
      }
      return moduleData;
    } else {
      return null;
    }
  };
  var notLoaded = function(moduleData) {
    if (moduleData.status !== "loading") {
      return moduleData;
    } else {
      return null;
    }
  };
  function allNonNull(predicate) {
    var all = [];
    for (var aRelModPath in OneClick.modulesFromRoot) {
      var moduleData = OneClick.modulesFromRoot[aRelModPath];
      var result = predicate(moduleData);
      if (result !== null) {
        return([result]);
      }
    }
    return all;
  }
  window.require = function(path) {
    var resolved = OneClick.resolve("main.html", path);
    var moduleData = OneClick.modulesFromRoot[resolved];
    if (!moduleData) {
      throw "Module " + resolved + " has not been initialized by anyone. You specified " + path;
    }
    if (moduleData.status !== "loading") {
      throw new Error("Module has not yet been loaded " + path +
       ". Use OneClick.onRequirable(pathFromRoot, callback) or OneClick.onMain(cb) to " +
        "ensure the module is loaded before your code runs.");
    }
    return moduleData.moduleExports;
  };
  function loadModuleForModuleData(moduleData) {
    moduleData.status = "loading";
    var iframe = document.createElement("iframe");
    iframe.name=moduleData.relPath;
    iframe.style = "display:none !important";
    document.body.appendChild(iframe);
    var doc = iframe.contentWindow.document;
    // If you remove the iframe, it will make it so that break points within it
    // do not work (and debugger calls as well) (and calls to console.log).
    var isolatedScript = `
        <html><head><title></title></head><body>
        <script>
          ${windowSetup}
          if(parent.OneClick.__DEBUG__MODULE_LOADING) {
            console.log('loading module ${moduleData.relPath}');
          }
          var origExports = {};
          window.module = {
            exports: origExports
          };
          window.exports = module.exports;
          require = function(reqPath) {
            var resolved = parent.OneClick.resolve("${moduleData.relPath}", reqPath);
            var moduleData = parent.window.OneClick.modulesFromRoot[resolved];
            if(!moduleData) {
              console.error(
                'Could not get module exports from ${moduleData.relPath} requiring ' +
                reqPath + '.' +
                ' This may be because we could not scrape the dependencies of ' + reqPath + '.' +
                'It might only issue its require statements later in the file. Try moving them ' +
                'closer to the top of the file.'
              );
              var moduleExports = {};
            } else {
              var moduleExports = moduleData.moduleExports;
            }
            return moduleExports;
          };
          // In this case, remapping the console isn't just for compatibility,
          // but there's a bug in chrome where consoles of iframes don't work.
          // https://github.com/karma-runner/karma/issues/1373
          // There's still an issue with the debugger not working in iframe'd
          // modules (Chrome only - no repro in Safari).
          // I believe it's becaue the code you place a debugger in is executed
          // in the iframe's context, but when called from another context such
          // as the Devtools Console does not invoke debuggers.
          // TODO: Add all the other builtins.
          Array = parent.Array;
        </script>
        <script src="${moduleData.relPath}"> </script></body></html>
        <script>
          if(typeof window.module.exports === 'object') {
            for(var exportedKey in window.module.exports) {
              parent.window.OneClick.modulesFromRoot["${moduleData.relPath}"].moduleExports[exportedKey] =
                window.module.exports[exportedKey];
            }
          } else {
            parent.window.OneClick.modulesFromRoot["${moduleData.relPath}"].moduleExports =
              window.module.exports;
          }

          if(parent.OneClick.__DEBUG__MODULE_LOADING) {
            console.log('set module exports ${moduleData.relPath}');
          }
         parent.afterModuleLoad(parent.window.OneClick.modulesFromRoot["${moduleData.relPath}"]);
          
        </script>
        </body></html>
    `;
    if(parent.OneClick.__DEBUG__MODULE_LOADING) {
      console.log('writing script for ' + moduleData.relPath);
    }
    doc.open();
    doc.write(isolatedScript);
    doc.close();
    if(parent.OneClick.__DEBUG__MODULE_LOADING) {
      console.log('wrote script for ' + moduleData.relPath);
    }
  }
  var handleScrapeMesage = function(moduleAt, makesRequireCalls) {
    var fieldAccessesByDependency = {};
    OneClick.modulesFromRoot[moduleAt].status = "scraped";
    for (var requireCall in makesRequireCalls) {
      var fieldAccesses = makesRequireCalls[requireCall];
      var rootRelRequireCall = OneClick.resolve(moduleAt, requireCall);
      fieldAccessesByDependency[rootRelRequireCall] = fieldAccesses;
      // Crawls the fieldAccessesByDependency:
      requireScrapeRound(moduleAt, requireCall);
    }
    OneClick.modulesFromRoot[
      moduleAt
    ].fieldAccessesByDependency = fieldAccessesByDependency;
    function allHaveStatus(status) {
      var allHave = true;
      for (var aRelModPath in OneClick.modulesFromRoot) {
        var moduleData = OneClick.modulesFromRoot[aRelModPath];
        for (var dependency in moduleData.fieldAccessesByDependency) {
          if (
            !OneClick.modulesFromRoot[dependency] ||
            OneClick.modulesFromRoot[dependency].status !== status
          ) {
            allHave = false;
          }
        }
      }
      return allHave;
    }
    var allScraped = allHaveStatus("scraped");
    if (allScraped) {
      var loadNext = function(max, previousLoadedModuleData) {
        // console.log('got load next command');
        if(max === 0) {
          throw "Could not load modules after 100 attempts";
        }
        if(previousLoadedModuleData) {
          if(OneClick.listenersByRelPath[previousLoadedModuleData.relPath]) {
            OneClick.listenersByRelPath[previousLoadedModuleData.relPath].forEach(function(cb){
              cb(previousLoadedModuleData.moduleExports)
            });
            OneClick.listenersByRelPath[previousLoadedModuleData.relPath] = [];
          }
        }
        var canBeLoaded = canBeLoaded = allNonNull(canAndShouldBeLoadedNow);
        if(canBeLoaded.length === 0) {
          canBeLoaded = allNonNull(canBreakCircularDependency);
        }
        if(canBeLoaded.length !== 0) {
          // console.log('loading', canBeLoaded.map(cbl=>cbl.relPath).join(','));
          window.afterModuleLoad = loadNext.bind(null, max - 1);
          canBeLoaded.forEach(function(cbl) {
            loadModuleForModuleData(cbl);
          });
        } else {
          var wasNotLoaded = allNonNull(notLoaded);
          if (wasNotLoaded.length !== 0) {
            printCircularDepError(wasNotLoaded);
          }
        }
      };
      loadNext(100, null);
    }
  };

  var handleBadRequireMessage = function(requestedBy, requireCall) {
    console.error(
      "Module " +
        requestedBy +
        " required('" +
        requireCall +
        "') which does not exist."
    );
  };

  // We get messages back about which modules depend on which.
  window.onmessage = function(msg) {
    if (msg.data.type === "scrapeMessage") {
      handleScrapeMesage(msg.data.moduleAt, msg.data.makesRequireCalls);
    } else if (msg.data.type === "badRequire") {
      handleBadRequireMessage(msg.data.requestedBy, msg.data.requireCall);
    }
  };
  function humanUsableResolve(fromModulePath, reqPath) {
    if (fromModulePath.charAt(0) === "." && fromModulePath[1] === "/") {
      fromModulePath = fromModulePath.substr(2);
    }
    var relativized = OneClick.resolve(fromModulePath, reqPath);
    return relativized;
  }
  function requireScrapeRound(fromModulePath, reqPath) {
    var relativized = humanUsableResolve(fromModulePath, reqPath);
    return scrapeModuleIdempotent(relativized, fromModulePath);
  }
  function requirePrepareMain(reqPath) {
    return requireScrapeRound("./main.html", reqPath);
  }
  function scrapeModuleIdempotent(relPathFromRoot, requestedBy) {
    if (OneClick.modulesFromRoot[relPathFromRoot]) {
      if (
        OneClick.modulesFromRoot[relPathFromRoot].status === "scraping" ||
        OneClick.modulesFromRoot[relPathFromRoot].status === "scraped"
      ) {
        return;
      }
    }
    var moduleData = {
      status: "scraping",
      relPath: relPathFromRoot,
      // Initially set to empty because we actually copy over fields to this in
      // case something needed to depend on it in a circular manner.
      moduleExports: {},
      fieldAccessesByDependency: null
    };
    OneClick.modulesFromRoot[relPathFromRoot] = moduleData;
    // Scrape the dependencies by dry running them.

    var iframe = document.createElement("iframe");
    iframe.name="Fake Module Loader Just To Scrape Dependency Graph";
    iframe.style = "display:none !important";
    document.body.appendChild(iframe);
    if(!OneClick.__DEBUG__MODULE_LOADING) {
      iframe.onload=function(){document.body.removeChild(iframe)};
    }
    
    var scrapingScript = `<html><head><title></title></head><body>
      <script>
        // THIS IS ONLY A TEST
        // --------------------------------------------------------
        // This is the dependency scraping script. It will crawl
        // through your dependencies to determine the dependency
        // graph by doing a dry run loading of your modules. Then it
        // will report that information to the real module loader.
        // We attempt to suppress any IO we can, so that it does not
        // confuse the developer.
        ${windowSetup}
        window.recordedFieldAccessesByRequireCall = {};
        console = {log: function(args) { }};
        console.error = window.console.log;
        console.warn = window.console.log;
        console.table = window.console.log;
        // TODO: Mock out any classes like XHR or LocalStorage.
        
        window.onerror = function(msg, url, lineNo, columnNo, error){
          // In iframe error - this is entirely expected. We mask all
          // issues, but uncomment debugger if you want to know
          // exactly what went wrong when loading the module.  Since
          // this is only a dry run loading of the modules, we return
          // mocked modules which don't behave as expected. Something
          // will go wrong - but we just needed the information about
          // dependency graph, and we discard this instance of the
          // module.
          return true;
        };
        exports = {};
        module = {
          exports: exports
        };
        require = function(modPath) {
          window.recordedFieldAccessesByRequireCall[modPath] = [];
          // https://www.mattzeunert.com/2016/07/20/proxy-symbol-tostring.html
          var megaProxyFields = {
            get: function(target, prop, receiver) {
              if(prop == Symbol.toPrimitive) {
                return function() {0;};
              }
              return megaProxy;
            },
            has: function(target, key) {
              return true;
            },
            apply: function(target, thisArg, argumentsList) {
              return megaProxy;
            },
            construct: function(target, args) {
              return megaProxy;
            },
            set: function(obj, prop, value) {
              return value;
            }
          };
          // The proxy proxies a function for maximum proxiness.
          var megaProxy = new Proxy(function(){}, megaProxyFields);
          var recordFieldAccess = new Proxy(function(){}, {
            get: function(target, prop, receiver) {
              window.recordedFieldAccessesByRequireCall[modPath].push(prop);
              return megaProxy;
            },
            set: megaProxyFields.set,
            has: megaProxyFields.has,
            apply: megaProxyFields.apply,
            construct: megaProxyFields.construct
          });
          return recordFieldAccess;
        };
        function onBadDep() {
          parent.postMessage({
              type: 'badRequire',
              requestedBy: "${requestedBy}",
              requireCall: "${relPathFromRoot}"
            },
            '*'
          );
        }
      </script>
      <script onerror="onBadDep()"src="${relPathFromRoot}"> </script></body></html>
      <script>
        parent.postMessage(
          {
            type:'scrapeMessage',
            moduleAt: "${relPathFromRoot}",
            makesRequireCalls: window.recordedFieldAccessesByRequireCall
          },
          '*'
        );
        // Just in case you try to require() in a Chrome console that is still
        // debugging this iframe.
        require = parent.require;
      </script>
    `;
    var doc = iframe.contentWindow.document;
    doc.open();
    doc.write(scrapingScript);
    doc.close();
  }
  // This isn't really commonJS compliant, but we'll relax it just for the data-main attribute.
  var main = getMain();
  if (main) {
    requirePrepareMain(main);
  }
  glob.OneClick = OneClick;
})(window);

