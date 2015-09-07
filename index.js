'user strict';

var through = require('through2');
var fs = require('fs');
var path = require('path');
var cheerio = require('cheerio');
var umdWrap = require('umd-wrap');
var assign = Object.assign || require('object.assign');
var CleanCSS = require('clean-css');
var autoprefixer = require('autoprefixer');
var postcss = require('postcss');
var prefixer = postcss([autoprefixer]);
var Q = require('q');

var i = 0;

module.exports = function(opt) {
    return through.obj(function(file, encoding, callback) {
        var source = new Buffer(file.contents, 'utf8').toString();
        var $ = cheerio.load(source);

        htmlToJs($).then(function(script) {
            opt = assign(opt || {}, {
                /*
                 * 将<link rel="import" href="ele.html">编译成<script src="ele.js">
                 * @param {String} linkHref
                 * @return {String} scriptSrc
                 */
                linkToJsPathMap: function(linkHref) {
                    var dirname = path.dirname(linkHref);
                    var basename = path.basename(linkHref, path.extname(linkHref));
                    return dirname + '/' + basename + '.js';
                },
                umd: {
                    exports: function(file) {
                        var dirpath = path.dirname(path.resolve(file.path)).split(path.sep);
                        var lastFoldName = dirpath[dirpath.length - 1];
                        return capitalize(dashToCamelCase(lastFoldName));
                    },
                    dependencies: function(file) {
                        return parseDependencies($, {
                            linkToJsPathMap: opt.linkToJsPathMap,
                            baseUrl: opt.baseUrl
                        });
                    },
                    root: function(file) {
                        return 'window';
                    }
                }
            });

            // wrap umd
            if(opt.umd) {
                var options = {
                    code: script,
                    exports: opt.umd.exports(file),
                    dependencies: opt.umd.dependencies(file)
                }
            }

            umdWrap(options, function(err, wrappedScript) {
                wrappedScript = '(function() {' + wrappedScript + '}).call(' + opt.umd.root() + ')';
                file.contents = new Buffer(wrappedScript);
                callback(null, file);
            });
        });
    })
};

function parseDependencies($, extra) {
    var depEls = $('link[rel=import],script[src]');
    var depArr = [];
    depEls.each(function(i, depEle) {
        var name = '';
        if(depEle.name == 'link') {
            name = extra.linkToJsPathMap($(depEle).attr('href'));
        } else {
            name = $(depEle).attr('src');
        }
        name = path.relative(extra.baseUrl, name).match(/(.+)\.js$/)[1];
        var pathArr = name.split('/');
        var exports = $(depEle).attr('exports') || '_' + dashToCamelCase(pathArr[pathArr.length - 1].split('.')[0]);
        depArr.push({
            name: name,
            exports: exports
        });
    });
    return depArr;
}

function dashToCamelCase(dash) {
    if (dash.indexOf('-') < 0) {
        return dash;
    }
    return dash.replace(/-([a-z])/g, function(m) {
        return m[1].toUpperCase();
    });
}

function capitalize(str) {
    str = str[0].toUpperCase() + str.slice(1);
    return str;
}


function htmlToJs($) {
    var deferred = Q.defer();

    var style = $('style').html() || '';
    var template = $('template').html() || '';

    // clean and prefix css
    prefixer.process(style).then(function(result) {
        var exports = {
            stylesheet: new CleanCSS().minify(result.css).styles,
            template: template
        }

        var domModule = $('dom-module');
        var script;

        if(domModule.length != 0) {
            script = domModule.children('script').html();
        } else {
            script = $('script:not([src])').html();
        }

        script = script.replace('Nova', 'NovaExports');
        script = 'NovaExports.__fixedUglify="script>";' + 'NovaExports.exports=' + JSON.stringify(exports).replace(/<\/script>/g, '</" + NovaExports.__fixedUglify + "') + ';' + script;

        deferred.resolve(script);

    });

    return deferred.promise;

}


