# One Click, Offline, CommonJS Modules

Use CommonJS modules directly in the browser with no build step and no web server.

- No need to start up a web server just to write and run CommonJS modules in the browser.
- Send static HTML/JS bundles to people that they can double click to open.
- Hit reload in the browser to refresh. Works offline.


### Using:

Just include a script tag like this, specifying a `data-main` entrypoint module
to load:

```html
<script type="text/javascript" src="./one-click.js" data-main="./my-module.js">
```

It follows node resolution so:
```
require('something/foo.js')
```

Will be searched for in `node_modules/foo.js`.

And

```
require('./rel/foo.js')
```

Will be searched for relative to the file that is requiring it.


### Not Using:

Do *not* use this in production. The only purpose of this utility is to make
local development simpler.


### Tradeoffs:
In order to make this work offline, One Click needs to initialize your modules
twice, once in the background upon page load, in order to map out the
dependency graph, and then another time to actually perform the module loading.
You would only notice that this is happening if your modules have debugger
statements in the top level module scope, or if they have some other side
effects.

### Details:
One of the reasons why this was challenging is because `var` declarations are
global variables in JS, and since `one-click.js` doesn't do any transforms to
your source files, it can't wrap them in functions to scope the variables. So
instead, we embed each file in a separate iframe in order to load.  This might
cause some problems if you are counting on the window object being exactly
equal to the window object in other modules. There may be a solution to that
problem.


See Also:
[require1k](http://stuk.github.io/require1k/) (Great reference, requires running a web server).
[require-polyfill](https://github.com/chenglou/require-polyfill)




