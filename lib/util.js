var _ = require("./lodash");

// Public utility functions
module.exports = {
  isSubgraph: isSubgraph,
  getMaxChildPaddingTop: getMaxChildPaddingTop,
  orderByRank: orderByRank,
  edgeToId: edgeToId,
  applyStyle: applyStyle,
  applyClass: applyClass,
  applyTransition: applyTransition
};

/*
 * Returns true if the specified node in the graph is a subgraph node. A
 * subgraph node is one that contains other nodes.
 */
function isSubgraph(g, v) {
  return !!g.children(v).length;
}

/*
 * Returns the max "paddingTop" property among the specified node's children.
 * A return value of 0 means this node has no children.
 */
function getMaxChildPaddingTop(g, v) {
  var maxPadding = 0;
  var children = g.children(v);
  for (var i = 0; i < children.length; i++) {
    var child = g.node(children[i]);
    if (child.paddingTop && child.paddingTop > maxPadding) {
      maxPadding = child.paddingTop;
    }
  }
  return maxPadding;
}

/* Return the rank of the specified node. A rank of 0 means the node has no children. */
function getRank(g, v) {
  var maxRank = 0;
  var children = g.children(v);
  for (var i = 0; i < children.length; i++) {
    var thisRank = getRank(g, children[i]) + 1;
    if (thisRank > maxRank) {
      maxRank = thisRank;
    }
  }
  return maxRank;
}

/*
 * Order the following nodes by rank, from the leaves to the roots.
 * This mutates the list of nodes in place while sorting them.
 */
function orderByRank(g, nodes) {
  return nodes.sort(function(x, y) {
    return getRank(g, x) - getRank(g, y);
  });
}

function edgeToId(e) {
  return escapeId(e.v) + ":" + escapeId(e.w) + ":" + escapeId(e.name);
}

var ID_DELIM = /:/g;
function escapeId(str) {
  return str ? String(str).replace(ID_DELIM, "\\:") : "";
}

function applyStyle(dom, styleFn) {
  if (styleFn) {
    dom.attr("style", styleFn);
  }
}

function applyClass(dom, classFn, otherClasses) {
  if (classFn) {
    dom
      .attr("class", classFn)
      .attr("class", otherClasses + " " + dom.attr("class"));
  }
}

function applyTransition(selection, g) {
  var graph = g.graph();

  if (_.isPlainObject(graph)) {
    var transition = graph.transition;
    if (_.isFunction(transition)) {
      return transition(selection);
    }
  }

  return selection;
}
