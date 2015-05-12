var _ = require("./lodash"),
    addLabel = require("./label/add-label"),
    util = require("./util");

module.exports = createClusters;

function createClusters(selection, g) {
  var clusters = g.nodes().filter(function(v) { return util.isSubgraph(g, v); }),
      svgClusters = selection.selectAll("g.cluster")
        .data(clusters, function(v) { return v; });

  // Clusters created from DOT subgraphs are prefixed with "cluster"
  // strip this prefix if it exists and use our own (i.e. "cluster_")
  var makeClusterIdentifier = function(v) {
    return "cluster_" + v.replace(/^cluster/, "");
  };

  svgClusters.enter()
    .append("g")
    .attr("class", makeClusterIdentifier)
    .attr("name", function(v) { return g.node(v).label; })
    .classed("cluster", true)
    .style("opacity", 0)
    .append("rect");

  // Draw the label for each cluster and adjust the padding for it.
  // We position the labels later because the dimensions and the positions
  // of the enclosing rectangles are still subject to change. Note that
  // the ordering here is important because we build the parents' padding
  // based on the children's.
  var sortedClusters = util.orderByRank(g, svgClusters.data());
  for (var i = 0; i < sortedClusters.length; i++) {
    var v = sortedClusters[i];
    var node = g.node(v);
    if (node.label) {
      var thisGroup = selection.select("g.cluster." + makeClusterIdentifier(v));
          labelGroup = thisGroup.append("g").attr("class", "label"),
          labelDom = addLabel(labelGroup, node),
          bbox = _.pick(labelDom.node().getBBox(), "width", "height");
      // Add some padding for the label
      // Do this recursively to account for our descendants' labels.
      // To avoid double counting, we must start from the leaves.
      node.paddingTop += bbox.height;
      node.paddingTop += util.getMaxChildPaddingTop(g, v);
    }
  }

  util.applyTransition(svgClusters.exit(), g)
    .style("opacity", 0)
    .remove();

  util.applyTransition(svgClusters, g)
    .style("opacity", 1);

  util.applyTransition(svgClusters.selectAll("rect"), g)
    .attr("width", function(v) {
      var node = g.node(v);
      return node.width + node.paddingLeft + node.paddingRight;
    })
    .attr("height", function(v) {
      var node = g.node(v);
      return node.height + node.paddingTop + node.paddingBottom;
    })
    .attr("x", function(v) {
      var node = g.node(v);
      return node.x - node.width / 2 - node.paddingLeft;
    })
    .attr("y", function(v) {
      var node = g.node(v);
      return node.y - node.height / 2 - node.paddingTop;
    });

  // Position the labels
  svgClusters.each(function() {
    var cluster = d3.select(this),
        label = cluster.select("g.label"),
        rect = cluster.select("rect"),
        bbox = label.node().getBBox(),
        labelW = bbox.width,
        labelH = bbox.height;
    var num = function(x) { return parseFloat(x.toString().replace(/px$/, "")); };
    var labelX = num(rect.attr("x")) + num(rect.attr("width")) - labelH / 2 + labelW / 2;
    var labelY = num(rect.attr("y")) + labelH;
    label.attr("text-anchor", "end")
      .attr("transform", "translate(" + labelX + "," + labelY + ")");
  });
}
