# One Click, Offline, CommonJS Modules

<img src="./example/button.png" alt="one click" title="One click" width="436px" height="307px">


Use CommonJS modules directly in the browser with no build step and no web server.

- No need to start up a web server just to write and run CommonJS modules in the browser.
- Send static HTML/JS bundles to people that they can double click to open.
- Hit reload in the browser to refresh. Works offline.

### Try:

Download this repo and double click the `./example/index.html` (that's sort of
the whole point).

### Using:

Either start with the example, or include a script tag like this in your
project, specifying a `data-main` entrypoint module to load:

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
Most of the globals on `window` are synchronized with the main window (except
the `window` and `document` variables which cannot be synchronized).

Since each module is isolated in their own iframes, array literals `[1, 2, 3]`
will technically be considered as originating from different `Array` classes
depending on which module they were created in.  This is already something that
the web has to deal with because objects could be created in any `iframe` - so
JS frameworks already guard against this and should work fine.
The main thing they need to do is use `Array.isArray` instead of `instanceof Array`,
and you should do so in your own code as well (regardless of if you use
`one-click.js`).


### If You Need To Access `window` or `document`:

Most commonJS modules and framework code will never assume there is exactly one
`window` or `document`, so they tend to accept an argument for root node to
their rendering functions (like ReactJS does). But if for some reason one of
your modules does want to access the main `window` or `document`, it can do so
with `parent.window.document`, or `parent.window`. When written that way, your
code will work whether or not it in an isolated iframe module, or running on
the root page (because on the root most page, `parent` is `window`).

See Also:
[require1k](http://stuk.github.io/require1k/) (Great reference, requires running a web server).
[require-polyfill](https://github.com/chenglou/require-polyfill)




