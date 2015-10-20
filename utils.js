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

module.exports = {
    dashToCamelCase: dashToCamelCase,
    capitalize: capitalize
};
