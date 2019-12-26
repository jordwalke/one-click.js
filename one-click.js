(function(glob) {
  
  var windowSetup =
    Object.getOwnPropertyNames(window).reduce(
      function(cur, nm) {
        return nm[0].toUpperCase() === nm[0] ? cur.concat([nm + ' = parent.' + nm]) : cur
      },
      []
    ).join(',');
      
  
  function printCircularDepError(wasNotLoaded) {
    // TODO: Support circular dependencies.
    var sawCircle = false;
    console.error(
      "Circular dependency or unsatisfiable module %c" + wasNotLoaded.relPath  + "%c -> [" +
      Object.keys(wasNotLoaded.fieldAccessesByDependency).map(function(dep) {
          return !OneClick.modulesFromRoot[dep] ? 'empty ' : (
            (!sawCircle && dep === wasNotLoaded.relPath ? (sawCircle = true, '%c' + dep + '%c') : dep) +
            ' -> [' +
            Object.keys(OneClick.modulesFromRoot[dep].fieldAccessesByDependency).map(
              function(depDep) {
                return !sawCircle && depDep === wasNotLoaded.relPath ? (sawCircle = true, '%c' + depDep + '%c') : depDep;
              }
            ).join(', ') + ']'
          );
        }).join(', ') + ']',
      'font-weight:bold; background: red; color: #ffffff',
      'font-weight:normal; background: none; color: none',
      sawCircle ? 'font-weight:bold; background: red; color: #ffffff' :
      '. Inspect the following window.OneClick.modulesFromRoot dependency graph for cicular references. ',
      sawCircle ?  'font-weight:normal; background: none; color: none' : window.OneClick.modulesFromRoot,
    );
  }
  function relativizeImpl(requiringDirRelRoot, toRel) {
    if(toRel.length === 0) {
      throw ["Cannot resolve ", requiringDirRelRoot.join('/'), toRel.join('/')];
    } else if(toRel[0][0] == '.' && toRel[0][1] === '.' && toRel[0].length === 2) {
      if (requiringDirRelRoot.length == 0) {
        throw ["Cannot resolve ", requiringDirRelRoot.join('/'), toRel.join('/')];
      }
      return relativizeImpl(
        requiringDirRelRoot.slice(0, requiringDirRelRoot.length - 1),
        toRel.slice(1).concat(['.']),
      );
    } else if(toRel[0][0] == '.' && toRel[0].length === 1) {
      // We know toRel is at least one. Is it two?
      if(toRel.length === 2) {
        var fileName = toRel[1];
        if(fileName.indexOf(".js") === -1 || fileName.indexOf(".js") !== fileName.length -3) {
          return [requiringDirRelRoot.concat(toRel[1]), 'index.js'];
        } else {
          return [requiringDirRelRoot, toRel[1]];
        }
      } else {
        return relativizeImpl(
          requiringDirRelRoot.concat(toRel[1]),
          ['.'].concat(toRel.slice(2))
        );
      }
    } else {
      return relativizeImpl(
        ['node_modules'],
        ['.'].concat(toRel)
      );
    };
  }
  var OneClick = {
    modulesFromRoot: {},
    resolve: function(requiringFileRelRoot, toRelativePath) {
      var fromRelativeToRootSplit = requiringFileRelRoot.split('/');
      var toRelativePathSplit = toRelativePath.split('/');
      var segments = relativizeImpl(
        // Remove the depending file, to leave only the dir
        fromRelativeToRootSplit.slice(0, fromRelativeToRootSplit.length - 1),
        toRelativePathSplit
      );
      return (segments[0]).concat(segments[1]).join('/')
    }
  };
  var canAndShouldBeLoadedNow = function(moduleData) {
    var allLoading = true;
    if(moduleData.status !== 'loading') {
      for(var dep in moduleData.fieldAccessesByDependency) {
        if(OneClick.modulesFromRoot[dep].status !== 'loading') {
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
    if(moduleData.status !== 'loading') {
      for(var dep in moduleData.fieldAccessesByDependency) {
        var invalidatesAbilityToBreakCircularDependency =
          OneClick.modulesFromRoot[dep].status !== 'loading' &&
          moduleData.fieldAccessesByDependency[dep].length !== 0;
        if(invalidatesAbilityToBreakCircularDependency) {
          return null;
        }
      }
      return moduleData;
    } else {
      return null;
    }
  };
  var notLoaded = function(moduleData) {
    if(moduleData.status !== 'loading') {
      return moduleData;
    } else {
      return null;
    }
  };
  function firstNonNull(predicate) {
    var allHave = true;
    for(var aRelModPath in OneClick.modulesFromRoot) {
      var moduleData = OneClick.modulesFromRoot[aRelModPath];
      var result = predicate(moduleData);
      if(result !== null) {
        return result;
      }
    }
    return null;
  }
  window.require = function(path) {
    var resolved = OneClick.resolve("main.html", path);
    var moduleData = OneClick.modulesFromRoot[resolved];
    if(!moduleData) {
      throw "Module has not been initialized by anyone " + path;
    }
    if(moduleData.status !== 'loading') {
      throw "Module has not yet been loaded " + path;
    }
    return moduleData.moduleExports;
  };
  function loadModuleForModuleData(moduleData) {
    moduleData.status = 'loading';
    var iframe = document.createElement('iframe');
    iframe.style="display:none !important"
    document.body.appendChild(iframe);
    var doc =iframe.contentWindow.document;
    // If you remove the iframe, it will make it so that break points within it
    // do not work (and debugger calls as well) (and calls to console.log).
    // iframe.onload=function(){document.body.removeChild(iframe)};
    var isolatedScript = `
        <html><head><title></title></head><body>
        <script>
          ${windowSetup}
          var origExports = {};
          window.module = {
            exports: origExports
          };
          window.exports = module.exports;
          require = function(reqPath) {
            var resolved = parent.OneClick.resolve("${moduleData.relPath}", reqPath);
            var moduleExports = parent.window.OneClick.modulesFromRoot[resolved].moduleExports;
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
        </script>
        </body></html>
    `;
    doc.open();
    doc.write(isolatedScript)
    doc.close();
  }
  var handleScrapeMesage = function(moduleAt, makesRequireCalls) {
    var fieldAccessesByDependency = {};
    OneClick.modulesFromRoot[moduleAt].status = 'scraped';
    for(var requireCall in makesRequireCalls) {
      var fieldAccesses = makesRequireCalls[requireCall];
      var rootRelRequireCall = OneClick.resolve(moduleAt, requireCall);
      fieldAccessesByDependency[rootRelRequireCall] = fieldAccesses;
      // Crawls the fieldAccessesByDependency:
      requireScrapeRound(moduleAt, requireCall);
    }
    OneClick.modulesFromRoot[moduleAt].fieldAccessesByDependency = fieldAccessesByDependency;
    function allHaveStatus(status) {
      var allHave = true;
      for(var aRelModPath in OneClick.modulesFromRoot) {
        var moduleData = OneClick.modulesFromRoot[aRelModPath];
        for(var dependency in moduleData.fieldAccessesByDependency) {
          if(!OneClick.modulesFromRoot[dependency] ||
            OneClick.modulesFromRoot[dependency].status !== status) {
            allHave = false;
          };
        }
      }
      return allHave;
    }
    var allScraped = allHaveStatus('scraped');
    if(allScraped) {
      var canBeLoaded;
      var count = 0;
      while(
        count++ < 100 &&
        (
          (canBeLoaded = firstNonNull(canAndShouldBeLoadedNow)) ||
          (canBeLoaded = firstNonNull(canBreakCircularDependency))
        )
      ) {
        loadModuleForModuleData(canBeLoaded);
      }
      var wasNotLoaded = firstNonNull(notLoaded);
      if(wasNotLoaded !== null) {
        printCircularDepError(wasNotLoaded);
      }
    }
  };

  var handleBadRequireMessage = function(requestedBy, requireCall) {
    console.error("Module " + requestedBy + " required('" + requireCall + "') which does not exist.");
  };
  
  // We get messages back about which modules depend on which.
  window.onmessage = function(msg) {
    if(msg.data.type === 'scrapeMessage') {
      handleScrapeMesage(
        msg.data.moduleAt,
        msg.data.makesRequireCalls
      );
    } else if(msg.data.type === 'badRequire') {
      handleBadRequireMessage(msg.data.requestedBy, msg.data.requireCall);
    } 
  };
  function requireScrapeRound(fromModulePath, reqPath) {
    if(fromModulePath.charAt(0) === '.' && fromModulePath[1] === '/') {
      fromModulePath = fromModulePath.substr(2);
    }
    var pathSegments = fromModulePath.split('/');
    var relativized = OneClick.resolve(fromModulePath, reqPath);
    return scrapeModuleIdempotent(relativized, fromModulePath);
  }
  function requirePrepareMain(reqPath) {
    return requireScrapeRound('./main.html', reqPath);
  }
  function scrapeModuleIdempotent(relPathFromRoot, requestedBy) {
    if(OneClick.modulesFromRoot[relPathFromRoot]) {
      if(OneClick.modulesFromRoot[relPathFromRoot].status === 'scraping' ||
        OneClick.modulesFromRoot[relPathFromRoot].status === 'scraped') {
        return;
      }
    }
    var moduleData = {
      status: 'scraping',
      relPath: relPathFromRoot,
      // Initially set to empty because we actually copy over fields to this in
      // case something needed to depend on it in a circular manner.
      moduleExports: {},
      fieldAccessesByDependency: null
    };
    OneClick.modulesFromRoot[relPathFromRoot] = moduleData;
    // Scrape the dependencies by dry running them.
    
    var iframe = document.createElement('iframe');
    iframe.style="display:none !important"
    document.body.appendChild(iframe);
    // iframe.onload=function(){document.body.removeChild(iframe)};
    var scrapingScript =
    `<html><head><title></title></head><body>
      <script>
        // Suppress any IO we can - we just want to scrape the deps.
        ${windowSetup}
        window.recordedFieldAccessesByRequireCall = {};
        console = {log: function(args) { }};
        console.error = window.console.log;
        console.warn = window.console.log;
        console.table = window.console.log;
        // TODO: Mock out any classes like XHR or LocalStorage.
        
        window.onerror = function(msg, url, lineNo, columnNo, error){
          // In iframe error - mask all issues, but break on debugger so
          // the user can know something happened when trying to map out
          // the dependency graph. It will likely throw an error again when
          // actually running the modules.
          debugger;
          return true;
        };
        exports = {};
        module = {
          exports: exports
        };
        require = function(modPath) {
          window.recordedFieldAccessesByRequireCall[modPath] = [];
          // TODO: make this a proxy object.
          var p = new Proxy({}, {
            get: function(target, prop, receiver) {
              window.recordedFieldAccessesByRequireCall[modPath].push(prop);
              return Reflect.get(...arguments);
            }
          });
          return p;
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
    var doc =iframe.contentWindow.document;
    doc.open();
    doc.write(scrapingScript)
    doc.close();
  }
  var main = document.querySelector("script[data-main]");
  var main = main.dataset.main;
  
  // This isn't really commonJS compliant, but we'll relax it just for the data-main attribute.
  if(main) {
    if(main.indexOf(".js") !== -1 || main.indexOf(".js") === main.length - 3) {
      if(main.indexOf('/') === -1 && main[0] !== '.') {
        main = './' + main;
      }
    }
    requirePrepareMain(main);
  }
  glob.OneClick = OneClick;
})(window);
