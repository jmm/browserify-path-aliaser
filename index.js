var
  path = require('path'),
  rs = require('browserify/node_modules/readable-stream'),
  mappings = {};

function plugin (b, opts) {
  var
    deps = b.pipeline.get('deps'),
    pack = b.pipeline.get('pack').get(0),
    stream;

  deps.push(aliaser());
  deps = deps.get(0);

  opts.deps = deps;
  opts.resolver = deps.resolver;

  // This is a hack to get browserify to export a require(). The alternative is
  // to set b.pipeline.get('pack').get(0).hasExports = true when something is
  // exposed. Pick your poison.
  stream = rs.PassThrough();
  stream.end(";");
  b.require(stream);

  opts.expose = function expose (key, val) {
    b._expose[key] = val;

    // This is the alternative to the dummy b.require() above.
    // pack.hasExports = true;
  };
  // expose

  deps.resolver = make_resolver(opts);
}
// plugin

function make_resolver (opts) {
  var
    resolver = opts.resolver,
    walk = opts.deps.walk.bind(opts.deps),
    expose = opts.expose,
    aliases = opts.aliases,
    visited = {};

  return alias_resolver;

  function alias_resolver (id, opts, cb) {
    var
      rec = {id: id, opts: opts},
      par_vis = visited[opts.filename] || {},
      processed;

    visited[opts.filename] = par_vis;

    processed = par_vis[rec.id];

    rec = processed || alias(rec);

    processed = !! processed;

    if (! processed) par_vis[rec.id] = rec;

    // Calling walk() is the alternative to pushing the pipeline step (as
    // above). Currently unused.

    // Aliased, exposed, and not previously visited.
    if (
      false &&
      ! processed &&
      rec.alias.expose
    ) {
      return walk({
        id: rec.alias.expose || rec.id,
        file: rec.id,
      }, opts, cb);
    }

    return resolver(rec.alias.id || rec.id, rec.opts, function (err, res, pkg) {
      if (! err && rec.alias.expose) {
        mappings[res] = rec.alias.expose;
        expose(rec.alias.expose, res);
      }
      cb(err, res, pkg);
    });
  };
  // alias_resolver

  function alias (rec) {
    var matched, id = rec.id;

    rec.alias = {id: rec.id};

    aliases.every(function (alias) {
      matched = true;

      if (
        (
          alias.type === 'd' &&
          rec.id.indexOf(alias.from + path.sep) === 0
        )

        ||

        (alias.type === 'f' && rec.id === alias.from)
      ) {
        rec.alias.id = alias.to + rec.id.substr(alias.from.length);
      }
      else if (typeof alias === 'function') {
        rec.alias = alias(rec.alias);
      }
      else matched = false;

      return ! matched;
    });

    rec.id = id;
    if (! (rec.alias && rec.alias.id)) rec.alias = {};

    return rec;
  }
  // alias
}
// make_resolver

function aliaser () {
  var stream = new rs.Transform({objectMode: true});

  stream._transform = write;

  function write (rec, enc, cb) {
    if (mappings[rec.file]) {
      rec.id = mappings[rec.file];
    }

    this.push(rec);
    cb();
  }
  // write

  return stream;
}
// aliaser

function simple (from, to, type) {
  return {from: from, to: to, type: type};
}
// simple

plugin.f = plugin.file = function (from, to) {
  return simple(from, to, 'f');
};

plugin.d = plugin.dir = function (from, to) {
  return simple(from, to, 'd');
};

module.exports = plugin;
