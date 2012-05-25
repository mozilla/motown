#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
 
const
Url = require('url');

var
ee = new require('events').EventEmitter(),
http = require('https'),
logger = require('winston'),
parsers = require('./parsers'),
deduper = new (require('./deduper'))(),
redis = require('../../lib/redis')();

require('../../lib/extensions/number');

var scrapeList;
var scrapers = {};

function Scraper(url, users, parser){
  this.url = url;
  this.users = users;
  this.parserClass = parsers[parser];
  this.updateFrequency = 2000;
    
  this.scrape = function(){
    logger.debug("Scraping! (" + this.url + ")");
    var httpOptions = Url.parse(this.url);
    var users = this.users;
    var parser = new this.parserClass(function(story){
      if (deduper.hasntHeardOf(story.id)){
        logger.debug("deduping: " + story.id);
        deduper.add(story.id);
        // LPUSH each story d -> [c,b,a] .. [d,c,b,a]
        try{
          redis.lpush("stories", JSON.stringify({users: users, story: story}), function (err, reply) {
            // logger.debug(["Added story to stories:", err, reply].join("\n\t"));
          });
        }
        catch(e){
          logger.error(e);
        }
      }
    });

    var scraper = this;

    http.get(httpOptions, function(response) {
      logger.debug("Scrape Response: " + response.statusCode);
      response.on('data', function (chunk) {
        parser.feed(chunk);
      }).on('error', function(e) {
        logger.error("Error scraping (" + this.url + "): \n" + e.message);
        scraper.setTimeout();
      }).on('end', function(e) {
        logger.debug("Finalizing scrape (" + this.url + ")");
        scraper.setTimeout();
      });
    });
  };

  this.setTimeout = function(){
    var that = this;
    this.timeout = setTimeout(function(){that.scrape()}, (30).seconds());
  };

  this.die = function(){
    clearTimeout(this.timeout);
  };

  this.scrape();  
}

function updateScrapers(){
  logger.info('Updating scrapers.');
  //TODO: Actually get the URLs or pull from sql
  var tasks = [
    {
      url: 'https://github.com/simonwex.private.atom?token=e268ea839eafefd3ce74a4a5b9bd9687',
      users: ['simon@simonwex.com', 'swex@mozilla.com', 'dascher@mozilla.com'],
      parser: 'AtomParser'
    },
    {
      url: 'https://blog.mozilla.org/feed/',
      users: ['simon@simonwex.com', 'swex@mozilla.com', 'dascher@mozilla.com'],
      parser: 'RssParser'
    }
  ];

  for (var i in scrapers){
    scrapers[i].die();
  }

  scrapers = {};

  for (i in tasks){
    var task = tasks[i];
    logger.debug(["Creating new scraper: ", task.url, task.users, task.parser].join("\n\t"));
    scrapers[task.url] = new Scraper(task.url, task.users, task.parser);
  }
}

updateScrapers();
