require('dotenv').config();
let express = require('express');
const bodyParser = require("body-parser");
const path = require("path");
let app = express();
const axios = require('axios');
const ip = require('ip');
const geoIpLite = require('geoip-lite');
const publicIp = require('public-ip');
const macros = require('./macros');


// middlewares
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public/img')));
app.set('views', path.resolve(__dirname, 'public/'));
app.set('view engine', 'ejs');


/**
 *
 * @returns {Promise<Array>}
 */
async function getTemperaturesOfMainCitiesInSouthAmerica() {
    let res = [];
    const cities = await getMainCities();

    for (let i = 0; i < cities.length; i++) {
        let weatherInfo = await fetchWeather(cities[i].city, cities[i].code);
        if (weatherInfo !== null) {
            let curInfo = await getCurrentInformation(weatherInfo);
            let obj = {};
            obj["city"] = curInfo.city;
            obj["currentTemp"] = curInfo.currentTemp;
            obj["codeCountry"] = curInfo.country;
            obj["conditions"] = curInfo.conditions;
            obj["icon"] = curInfo.icon;
            res.push(obj);
        }
    }
    return res;
}


/**
 *
 * @param temps
 * @returns {number}
 */
function getMinTempInSouthAmerica(temps) {
    return Math.min(...temps);
}


/**
 *
 * @param temps
 * @returns {number}
 */
function getMaxTempInSouthAmerica(temps) {
    return Math.max(...temps);
}



function round(n) {
    let left = (n / macros.TEMP_INTERVAL) * macros.TEMP_INTERVAL;
    let right = left + macros.TEMP_INTERVAL;

    // Return of closest of two
    return (n - left > right - n)? right : left;
}
/**
 *
 * @param minTemp
 * @returns {number}
 */
function getStartInterval(minTemp) {
    return round(minTemp);
}

/**
 *
 * @param maxTemp
 * @returns {number}
 */
function getEndInterval(maxTemp) {
    return round(maxTemp);
}


/**
 *
 * @param start
 * @param end
 * @returns {number}
 */
function getNumberOfIntervals(end) {
    return end / macros.TEMP_INTERVAL;
}


async function getIntervalOfTemperatureWithCorrespoindingCities(numberOfIntervals, end) {
    let res = [],
        temperatures = await getTemperaturesOfMainCitiesInSouthAmerica(),
        firstInterval = `[${0} - ${macros.TEMP_INTERVAL}]`,
        lastInterval = `[${(end-macros.TEMP_INTERVAL) + 1} - ${end}]`,
        firstObj = {},
        lastObj = {};


    firstObj["interval"] = firstInterval;
    firstObj["cities"] = temperatures
        .filter(function(item){
        return item.currentTemp >= 0 && item.currentTemp <= macros.TEMP_INTERVAL;
    })
        .map(function (item) {
            return item.city;
        });

    res.push(firstObj);

    for(let i = 1; i < numberOfIntervals-1; i++) {
        let leftBorder = (i * macros.TEMP_INTERVAL) + 1,
            rightBorder = ((i+1)*macros.TEMP_INTERVAL),
            obj = {};
        obj["interval"] =  `[${leftBorder} - ${rightBorder}]`;
        obj["cities"] = temperatures
            .filter(function(item){
                return item.currentTemp >= leftBorder && item.currentTemp <= rightBorder;
            })
            .map(function (item) {
                return item.city;
            });

        res.push(obj);

    }

    lastObj["interval"] = lastInterval;
    lastObj["cities"] = temperatures
        .filter(function(item){
            return item.currentTemp >= (end-macros.TEMP_INTERVAL) + 1 && item.currentTemp <= end;
        })
        .map(function (item) {
            return item.city;
        });
    res.push(lastObj);


    return res;
}


/**
 *
 * @returns {Promise<void>}
 */
async function getPublicIP() {
    return await publicIp.v4();
}


/**
 *
 * @param ip
 * @returns {Promise<void>}
 */
async function getGeoPositionFromIp(ip) {
    return await geoIpLite.lookup(ip.toString());
}


/**
 *
 * @param ip
 * @returns {Promise<*>}
 */
async function getCityFromIpAddress(ip) {
    let position = await getGeoPositionFromIp(ip);
    return position.city;
}


/**
 *
 * @param ip
 * @returns {Promise<string>}
 */
async function getCodeCountryFromIpAddress(ip) {
    let position = await getGeoPositionFromIp(ip);
    return (position.country).toLowerCase();
}


/**
 *
 * @returns {Promise<*>}
 */
async function getMainCities() {
    return await require('./main_cities_south_america');
}


app.get('/', async function (req, res) {
    let ip = await getPublicIP(),
        city = await getCityFromIpAddress(ip),
        codeCountry = await getCodeCountryFromIpAddress(ip),
        weatherInfo = await fetchWeather(city, codeCountry),
        currentInformation = await getCurrentInformation(weatherInfo);

    // for south america
    let obj = await getTemperaturesOfMainCitiesInSouthAmerica(),
        temperatures = obj.map(item => item.currentTemp),
        maxTemp = getMaxTempInSouthAmerica(temperatures),
        end = getEndInterval(maxTemp),
        numberOfIntervals = getNumberOfIntervals(end);

    app.locals = {
        weather: currentInformation,
        mainCities: getTemperaturesOfMainCitiesInSouthAmerica(),
        mainCitiesAndTemperatures: await getIntervalOfTemperatureWithCorrespoindingCities(numberOfIntervals,  end)
    }

    res.render('index', {
        weather: app.locals.weather,
        mainCities: app.locals.mainCities,
        mainCitiesAndTemperatures: app.locals.mainCitiesAndTemperatures
    });
});


app.get('/weather?:city=:name&country=:code', async function (req, res) {
    /*let city = req.body.name,
        codeCountry = req.body.code,
        weatherInfo = await fetchWeather(city, codeCountry),
        currentInformation = await getCurrentInformation(weatherInfo);
       //


    app.locals = {
        weather: currentInformation
    }
    res.render('index', {
        weather: app.locals.weather
    });*/
});


/**
 *
 * @param weather
 * @returns {Promise<void>}
 */
async function getCurrentInformation(weather) {
    let res = {};
    res["city"] = weather.name;
    res["country"] = await getCountryFromCode(weather.sys.country);
    res["codeCountry"] = (weather.sys.country).toLowerCase();
    res["currentTemp"] = getTemperatureInCelcius(weather.main.temp);
    res["minTemp"] = getTemperatureInCelcius(weather.main.temp_min, macros.MIN_TEMP);
    res["maxTemp"] = getTemperatureInCelcius(weather.main.temp_max);
    res["feltTemp"] = getTemperatureInCelcius(weather.main.feels_like);
    res["humidity"] = weather.main.humidity;
    res["conditions"] = weather.weather[0].main;
    res["icon"] = getIcon(weather.weather[0].icon);
    res["condition_descr"] = weather.weather[0].description;
    res["windSpeed"] = getWindSpeedInKmPerHour(weather.wind.speed);

    await setForecastForNextFiveDays(await res);

    return res;
}


/**
 *
 * @param iconCode
 * @returns {string}
 */
function getIcon(iconCode) {
    return `http://openweathermap.org/img/wn/${iconCode}@2x.png`;
}


/**
 *
 * @param wind
 * @returns {number}
 */
function getWindSpeedInKmPerHour(wind) {
    return parseFloat(Math.ceil(wind * macros.SPEED_FACTOR).toFixed(2));
}


/**
 *
 * @param codeCountry
 * @returns {Promise<*>}
 */
async function getCountryFromCode(codeCountry) {
    let countries = await getAllCountries();
    return countries[codeCountry];
}


/**
 *
 * @param country
 * @returns {Promise<string>}
 */
async function getCodeFromCountry(country) {
    let countries = await getAllCountries();
    return (Object.keys(countries).find(el => countries[el] = country)[0]).toString();
}


/**
 *
 * @param currentInformation
 * @returns {Promise<void>}
 */
async function setForecastForNextFiveDays(currentInformation) {
    let forecast = await axios.get(`http://api.openweathermap.org/data/2.5/forecast?q=${currentInformation.city},${getCodeFromCountry(currentInformation.country)}&&APPID=${process.env.API_KEY}`);
    let tmp = [];

    if (forecast) {
        Object.defineProperty(currentInformation, "forecast", {
            value: []
        });
        tmp = forecast.data.list.filter(el => el["dt_txt"].includes(macros.dayTime.MIDDAY));
        for (let i = 0; i < tmp.length; i++) {
            let foreCastObj = {};
            foreCastObj["day"] = getDay(tmp[i]["dt_txt"], "T");
            foreCastObj["minTemp"] = getTemperatureInCelcius(tmp[i]["main"]["temp_min"], macros.MIN_TEMP);
            foreCastObj["maxTemp"] = getTemperatureInCelcius(tmp[i]["main"]["temp_max"]);
            foreCastObj["condition"] = tmp[i]["weather"][0].main;
            foreCastObj["icon"] = getIcon(tmp[i]["weather"][0].icon);

            currentInformation["forecast"].push(foreCastObj);
        }
    }
}


/**
 *
 * @param rawDate
 * @param separator
 * @returns {number}
 */
function getDayIndex(rawDate, separator) {
    return new Date(new Date(rawDate).toISOString().split(separator)[0]).getDay();
}


/**
 *
 * @param rawDate
 * @param separator
 * @returns {*}
 */
function getDay(rawDate, separator) {
    let weekday = require('./weekday');
    let dayIndex = getDayIndex(rawDate, separator);
    return weekday[dayIndex];
}


/**
 *
 * @returns {Promise<null>}
 */
async function getAllCountries() {
    let res = null;
    try {
        res = await axios.get("http://country.io/names.json");
    } catch (error) {
        console.log(error);
    }
    return res ? res.data : null;
}


/**
 *
 * @param tempInKelvin
 * @param min
 * @returns {number}
 */
function getTemperatureInCelcius(tempInKelvin, min) {
    return min ? Math.floor(tempInKelvin - macros.TEMP_FACTOR) : Math.ceil(tempInKelvin - macros.TEMP_FACTOR);
}


/**
 *
 */
function run() {
    app.listen(process.env.port, function () {
        console.log('Server listen at port ', process.env.PORT);
    })
}

/**
 *
 * @param city
 * @param codeCountry
 * @returns {Promise<null>}
 */
async function fetchWeather(city, codeCountry) {
    let res = null;
    let url = `http://api.openweathermap.org/data/2.5/weather?q=${city},${codeCountry}&APPID=${process.env.API_KEY}`;
    try {
        res = await axios.get(url);
    } catch (error) {
        console.error(error);
    }
    return res ? res.data : null;
}


// start point of the app
run();