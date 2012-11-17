/*
 * The algorithms here are based on Brandes and Köpf, "Fast and Simple
 * Horizontal Coordinate Assignment".
 */
dagre.layout.position = function() {
  // External configuration
  var config = {
    nodeSep: 50,
    edgeSep: 10,
    rankSep: 30,
    rankDir: "TB",
    debugAlignment: null,
    debugLevel: 0
  };

  var timer = createTimer();

  var self = {};

  self.nodeSep = propertyAccessor(self, config, "nodeSep");
  self.edgeSep = propertyAccessor(self, config, "edgeSep");
  self.rankSep = propertyAccessor(self, config, "rankSep");
  self.rankDir = propertyAccessor(self, config, "rankDir");
  self.debugAlignment = propertyAccessor(self, config, "debugAlignment");
  self.debugLevel = propertyAccessor(self, config, "debugLevel", function(x) {
    timer.enabled(x);
  });

  self.run = timer.wrap("Position Phase", run);

  return self;

  function run(g) {
    var layering = [];
    g.eachNode(function(u, node) {
      var layer = layering[node.rank] || (layering[node.rank] = []);
      layer[node.order] = u;
    });

    var conflicts = findConflicts(g, layering);

    var xss = {};
    ["up", "down"].forEach(function(vertDir) {
      if (vertDir === "down") layering.reverse();

      ["left", "right"].forEach(function(horizDir) {
        if (horizDir === "right") reverseInnerOrder(layering);

        var dir = vertDir + "-" + horizDir;
        if (!config.debugAlignment || config.debugAlignment === dir) {
          var align = verticalAlignment(g, layering, conflicts, vertDir === "up" ? "predecessors" : "successors");
          xss[dir]= horizontalCompaction(g, layering, align.pos, align.root, align.align);
          if (horizDir === "right") flipHorizontally(layering, xss[dir]);
        }

        if (horizDir === "right") reverseInnerOrder(layering);
      });

      if (vertDir === "down") layering.reverse();
    });

    if (config.debugAlignment) {
      // In debug mode we allow forcing layout to a particular alignment.
      g.eachNode(function(u, node) { x(g, u, xss[config.debugAlignment][u]); });
    } else {
      balance(g, layering, xss);
    }

    // Translate layout so left edge of bounding rectangle has coordinate 0
    var minX = min(g.nodes().map(function(u) { return x(g, u) - width(g, u) / 2; }));
    g.eachNode(function(u) { x(g, u, x(g, u) - minX); });

    // Align y coordinates with ranks
    var posY = 0;
    layering.forEach(function(layer) {
      var maxHeight = max(layer.map(function(u) { return height(g, u); }));
      posY += maxHeight / 2;
      layer.forEach(function(u) { y(g, u, posY); });
      posY += maxHeight / 2 + config.rankSep;
    });
  };

  /*
   * Generate an ID that can be used to represent any undirected edge that is
   * incident on `u` and `v`.
   */
  function undirEdgeId(u, v) {
    return u < v
      ? u.toString().length + ":" + u + "-" + v
      : v.toString().length + ":" + v + "-" + u;
  }

  function findConflicts(g, layering) {
    var conflicts = {}, // Set of conflicting edge ids
        pos = {};       // Position of node in its layer

    if (layering.length <= 2) return conflicts;

    layering[1].forEach(function(u, i) { pos[u] = i; });
    for (var i = 1; i < layering.length - 1; ++i) {
      prevLayer = layering[i];
      currLayer = layering[i+1];
      var k0 = 0; // Position of the last inner segment in the previous layer
      var l = 0;  // Current position in the current layer (for iteration up to `l1`)

      // Scan current layer for next node that is incident to an inner segement
      // between layering[i+1] and layering[i].
      for (var l1 = 0; l1 < currLayer.length; ++l1) {
        var u = currLayer[l1]; // Next inner segment in the current layer or
                               // last node in the current layer
        pos[u] = l1;

        var k1 = undefined; // Position of the next inner segment in the previous layer or
                            // the position of the last element in the previous layer
        if (g.node(u).dummy) {
          var uPred = g.predecessors(u)[0];
          if (g.node(uPred).dummy)
            k1 = pos[uPred];
        }
        if (k1 === undefined && l1 === currLayer.length - 1)
          k1 = prevLayer.length - 1;

        if (k1 !== undefined) {
          for (; l <= l1; ++l) {
            g.predecessors(currLayer[l]).forEach(function(v) {
              var k = pos[v];
              if (k < k0 || k > k1)
                conflicts[undirEdgeId(currLayer[l], v)] = true;
            });
          }
          k0 = k1;
        }
      }
    }

    return conflicts;
  }

  function verticalAlignment(g, layering, conflicts, relationship) {
    var pos = {},   // Position for a node in its layer
        root = {},  // Root of the block that the node participates in
        align = {}; // Points to the next node in the block or, if the last
                    // element in the block, points to the first block's root

    layering.forEach(function(layer) {
      layer.forEach(function(u, i) {
        root[u] = u;
        align[u] = u;
        pos[u] = i;
      });
    });

    layering.forEach(function(layer) {
      var prevIdx = -1;
      layer.forEach(function(v) {
        var related = g[relationship](v), // Adjacent nodes from the previous layer
            m;                            // The mid point in the related array

        if (related.length > 0) {
          related.sort(function(x, y) { return pos[x] - pos[y]; });
          mid = (related.length - 1) / 2;
          related.slice(Math.floor(mid), Math.ceil(mid) + 1).forEach(function(u) {
            if (align[v] === v) {
              if (!conflicts[undirEdgeId(u, v)] && prevIdx < pos[u]) {
                align[u] = v;
                align[v] = root[v] = root[u];
                prevIdx = pos[u];
              }
            }
          });
        }
      });
    });

    return { pos: pos, root: root, align: align };
  }

  /*
   * Determines how much spacing u needs from its origin (center) to satisfy
   * width and node separation.
   */
  function deltaX(g, u) {
    var sep = g.node(u).dummy ? config.edgeSep : config.nodeSep;
    return width(g, u) / 2 + sep / 2;
  }

  // This function deviates from the standard BK algorithm in two ways. First
  // it takes into account the size of the nodes. Second it includes a fix to
  // the original algorithm that is described in Carstens, "Node and Label
  // Placement in a Layered Layout Algorithm".
  function horizontalCompaction(g, layering, pos, root, align) {
    var sink = {},  // Mapping of node id -> sink node id for class
        shift = {}, // Mapping of sink node id -> x delta
        pred = {},  // Mapping of node id -> predecessor node (or null)
        xs = {};    // Calculated X positions

    layering.forEach(function(layer) {
      layer.forEach(function(u, i) {
        sink[u] = u;
        if (i > 0)
          pred[u] = layer[i - 1];
      });
    });

    function placeBlock(v) {
      if (!(v in xs)) {
        xs[v] = 0;
        var w = v;
        do {
          if (pos[w] > 0) {
            var u = root[pred[w]];
            placeBlock(u);
            if (sink[v] === v) {
              sink[v] = sink[u];
            }
            var delta = deltaX(g, pred[w]) + deltaX(g, w);
            if (sink[v] !== sink[u]) {
              shift[sink[u]] = Math.min(shift[sink[u]] || Number.POSITIVE_INFINITY, xs[v] - xs[u] - delta);
            } else {
              xs[v] = Math.max(xs[v], xs[u] + delta);
            }
          }
          w = align[w];
        } while (w !== v);
      }
    }

    // Root coordinates relative to sink
    values(root).forEach(function(v) {
      placeBlock(v);
    });

    // Absolute coordinates
    layering.forEach(function(layer) {
      layer.forEach(function(v) {
        xs[v] = xs[root[v]];
        var xDelta = shift[sink[v]];
        if (root[v] === v && xDelta < Number.POSITIVE_INFINITY)
          xs[v] += xDelta;
      });
    });

    return xs;
  }

  function findMinCoord(g, layering, xs) {
    return min(layering.map(function(layer) {
      var u = layer[0];
      return xs[u] - width(g, u) / 2;
    }));
  }

  function findMaxCoord(g, layering, xs) {
    return max(layering.map(function(layer) {
      var u = layer[layer.length - 1];
      return xs[u] - width(g, u) / 2;
    }));
  }

  function balance(g, layering, xss) {
    var min = {},                            // Min coordinate for the alignment
        max = {},                            // Max coordinate for the alginment
        smallestAlignment,
        shift = {};                          // Amount to shift a given alignment

    var smallest = Number.POSITIVE_INFINITY;
    for (var alignment in xss) {
      var xs = xss[alignment];
      min[alignment] = findMinCoord(g, layering, xs);
      max[alignment] = findMaxCoord(g, layering, xs);
      var w = max[alignment] - min[alignment];
      if (w < smallest) {
        smallest = w;
        smallestAlignment = alignment;
      }
    }

    // Determine how much to adjust positioning for each alignment
    ["up", "down"].forEach(function(vertDir) {
      ["left", "right"].forEach(function(horizDir) {
        var alignment = vertDir + "-" + horizDir;
        shift[alignment] = horizDir === "left"
            ? min[smallestAlignment] - min[alignment]
            : max[smallestAlignment] - max[alignment];
      });
    });

    // Find average of medians for xss array
    g.eachNode(function(v) {
      var xs = [];
      for (alignment in xss)
        xs.push(xss[alignment][v] + shift[alignment]);
      xs.sort(function(x, y) { return x - y; });
      x(g, v, (xs[1] + xs[2]) / 2);
    });
  }

  function flipHorizontally(layering, xs) {
    var maxCenter = max(values(xs));
    Object.keys(xs).forEach(function(u) {
      xs[u] = maxCenter - xs[u];
    });
  }

  function reverseInnerOrder(layering) {
    layering.forEach(function(layer) {
      layer.reverse();
    });
  }

  function width(g, u) {
    switch (config.rankDir) {
      case "LR": return g.node(u).height;
      default:   return g.node(u).width;
    }
  }

  function height(g, u) {
    switch(config.rankDir) {
      case "LR": return g.node(u).width;
      default:   return g.node(u).height;
    }
  }

  function x(g, u, x) {
    switch (config.rankDir) {
      case "LR":
        if (arguments.length < 3) {
          return g.node(u).y;
        } else {
          g.node(u).y = x;
        }
        break;
      default:
        if (arguments.length < 3) {
          return g.node(u).x;
        } else {
          g.node(u).x = x;
        }
    }
  }

  function y(g, u, y) {
    switch (config.rankDir) {
      case "LR":
        if (arguments.length < 3) {
          return g.node(u).x;
        } else {
          g.node(u).x = y;
        }
        break;
      default:
        if (arguments.length < 3) {
          return g.node(u).y;
        } else {
          g.node(u).y = y;
        }
    }
  }
}
