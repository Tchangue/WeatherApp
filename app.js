var express = require('express');
const bodyParser = require("body-parser");
const path = require("path");
var app = express();

app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.resolve(__dirname, 'public/'));
app.set('view engine', 'ejs');

app.get('/', function (req, res) {
   res.render('index');
});

app.listen(3000, function () {
    console.log('Server listen at port ', 3000);
})