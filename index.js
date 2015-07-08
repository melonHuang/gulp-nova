'user strict';

var through = require('through2');
var fs = require('fs');
var cheerio = require('cheerio');

function compile(file, encoding, callback) {
    var source = new Buffer(file.contents, 'utf8').toString();

    var $ = cheerio.load(source);

    var style = $('style').html();
    var template = $('template').html();
    var exports = {
        stylesheet: style,
        template: template
    }

    var domModule = $('dom-module');
    var script;

    if(domModule.length != 0) {
        script = domModule.children('script').html();
    } else {
        script = $('script').html();
    }



    script = script.replace('Nova', 'NovaExports');
    script = 'NovaExports.exports=' + JSON.stringify(exports) + ';' + script;

    file.contents = new Buffer(script);
    callback(null, file);
}


module.exports = function(opt) {
    return through.obj(compile)
};
