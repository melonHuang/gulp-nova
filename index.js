'user strict';

var through = require('through2');
var fs = require('fs');
var path = require('path');
var cheerio = require('cheerio');
var umdWrap = require('umd-wrap');
var assign = Object.assign || require('object.assign');
var extend = require('extend');
var CleanCSS = require('clean-css');
var autoprefixer = require('autoprefixer');
var postcss = require('postcss');
var prefixer = postcss([autoprefixer]);
var slash = require('slash');;
var requirejs = require('requirejs');
var temp = require('temp').track();
var amdclean = require('amdclean');
var utils = require('./utils');
var Promise = require('promise');

var i = 0;

module.exports = function(option) {
    return through.obj(function(file, encoding, callback) {
        var source = new Buffer(file.contents, 'utf8').toString();
        var $ = cheerio.load(source);
        var domModule = $('template[is=dom-module]');

        if(domModule.length == 0) {
            console.warn(file.path, 'no dom-module found');
            callback();
            return;
        };

        htmlToJs($).then(function(script) {
            var defaultOpt = {
                umd: {
                    exports: function(file) {
                        var dirpath = path.dirname(path.resolve(file.path)).split(path.sep);
                        var lastFoldName = dirpath[dirpath.length - 1];
                        return utils.capitalize(utils.dashToCamelCase(lastFoldName));
                    },
                    root: function(file) {
                        return 'window';
                    }
                }
            };
            var opt = extend({}, defaultOpt, option);

            var dependencies = parseDependencies($);


            // wrap umd
            if(opt.umd) {
                var options = {
                    code: script,
                    exports: getExport($) || opt.umd.exports(file),
                    dependencies: dependencies
                }

                umdWrap(options, function(err, wrappedScript) {
                    wrappedScript = '(function() {' + wrappedScript + '}).call(' + opt.umd.root() + ')';

                    if(opt.combo) {
                        combo({
                            file: file,
                            code: wrappedScript,
                            dependencies: dependencies,
                            baseUrl: opt.combo.baseUrl
                        }).then(function(cleanedScript) {
                            console.log(cleanedScript);
                            file.contents = new Buffer(cleanedScript);
                            callback(null, file);
                        });
                    } else {
                        file.contents = new Buffer(wrappedScript);
                        callback(null, file);
                    }
                });
            } else {
                file.contents = new Buffer(script);
                callback(null, file);
            }
        }).catch(function(e) {
            console.log(e);
        });
    })
};




function htmlToJs($) {
    var domModule = $('template[is=dom-module]');


    var style = domModule.children('style').html() || '';
    var template = domModule.children('template').html() || '';
    var script = domModule.children('script:not([require-src])').html();

    id = domModule.attr('id');

    // clean and prefix css
    return prefixer.process(style).then(function(result) {
        var exports = {
            stylesheet: new CleanCSS().minify(result.css).styles,
            template: template
        }


        script = script.replace('Nova(', 'NovaExports(');
        script = 'NovaExports.__fixedUglify="script>";' + 'NovaExports.exports=' + JSON.stringify(exports).replace(/<\/script>/g, '</" + NovaExports.__fixedUglify + "') + ';' + script;

        return script;

    });
}


var exportsCount = 0;
function parseDependencies($, extra) {
    var domModule = $('template[is=dom-module]');
    var depEls = domModule.children('link[rel=import],script[require-src]');
    var depArr = [];
    depEls.each(function(i, depEle) {
        var name = '';
        name = $(depEle).attr('require-src').trim();

        var pathArr = name.split(path.sep);
        var exports = $(depEle).attr('exports') || '_' + ++exportsCount;
        depArr.push({
            name: slash(name),
            exports: exports
        });
    });
    return depArr;
}

function getExport($) {
    var domModule = $('template[is=dom-module]');
    var script = domModule.children('script:not([require-src])');
    return script.attr('exports');
}

function combo(opt) {
    var tmpSource = temp.openSync({ suffix: '.js'});
    var sourcePath = opt.file.path.replace(/.html$/, '.js');
    var tmpFile = temp.openSync({ suffix: '.js'});
    fs.writeFileSync(sourcePath, opt.code, 'utf-8');
    var baseUrl = opt.baseUrl;
    var config = {
        baseUrl: baseUrl,
        name: path.relative(baseUrl, sourcePath.replace(/.js/, '')),
        out: path.relative(baseUrl, tmpFile.path),
        onModuleBundleComplete: function (data) {
            outputFile = data.path,
            cleanedCode = amdclean.clean({
                'filePath': outputFile,
                'transformAMDChecks': false
            });
            fs.writeFileSync(outputFile, cleanedCode);
        }
    }
    return new Promise(function(resolve) {
        requirejs.optimize(config, function() {
            var content = fs.readFileSync(config.out, 'utf8');
            resolve(content);
        });
    });
}

