#!/usr/local/bin/node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */



// Module dependencies.
const 
express     = require('express'),
logger      = require('../../lib/logger'),
passport    = require('passport'),
util        = require('util'),
application = require('./controllers/application'),
redis       = require('../../lib/redis')(),
socket      = require('./socket'),
connect     = require('connect'),
RedisStore  = require('connect-redis')(connect),
BrowserID   = require('passport-browserid').Strategy,
User        = require('../models/user'),
config      = require('../../lib/configuration');



passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.find(id, function(err, user){
    if (user){
      done(null, user);
    }
  });
});

passport.use(new BrowserID({
    audience: config.get('public_url')
  },
  function(email, done) {
    User.findByEmail(email, function(err, user){
      if (user){
        return done(null, user);
      }
      else{
        // This means it's the first time the user has even logged in.
        // TODO: Wrap this up into the user model.
        user = new User({'email': email});
        user.save(function(err, user){
          if (err){
            logger.error("Error saving user after login (" + email + ")");
          }
          else{
            // TODO: Make this configurable:
            mysql.query(
              "INSERT INTO feeds (url, user_id, title, verified) VALUES \
               (?, ?, ?, ?), (?, ?, ?, ?)",
              [
               'http://blog.mozilla.org/feed/', user.id, 'The Mozilla Blog', true,
               'http://blog.mozilla.org/labs/feed/', user.id, 'Mozilla Labs', true
              ],
              function(err){
                if (err)
                  logger.error("Error while setting default feeds: " + err);
                return done(null, user);
              }
            );
          }
        });
      }
    });
  }
));

var http = express.createServer();

var sessionStore = new RedisStore({
      maxAge: (1).day
    });
// Express Configuration
http.configure(function(){
  http.set('views', __dirname + '/views');
  http.set('view engine', 'ejs');

  http.use(express.logger());
  http.use(express.static(__dirname + '/public'));
  http.use(express.cookieParser());
  http.use(express.bodyParser());
  http.use(express.methodOverride());
  //TODO: Load secret from config/env var
  http.use(express.session({
    secret: 'As a kid I ran down the stairs at full speed because I imagined Indians with bows and arrows would hit me if I walked.',
    key: 'express.sid',
    store: sessionStore
  }));

  http.use(function (req, res, next) {
    res.removeHeader("X-Powered-By");
    next();
  });

  // Initialize Passport! 
  http.use(passport.initialize());
  // Support persistent sessions:
  http.use(passport.session());
  http.use(http.router);
});

http.configure('development', function(){
  http.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

http.configure('production', function(){
  http.use(express.errorHandler());
});

// HTTP Routes
routes = {
  site:     require('./controllers/site'),
  social:   require('./controllers/social'),
  profile:  require('./controllers/profile'),
  feeds:    require('./controllers/feeds')
};


http.get('/',       routes.site.index);
http.get('/signout', routes.site.signout);
http.post('/auth/browserid', passport.authenticate('browserid', { failureRedirect: '/login' }), routes.site.authenticate);


http.get('/social/worker.js',     routes.social.worker);
http.get('/social/sidebar',       routes.social.sidebar);
http.get('/social/manifest.json', routes.social.manifest);

http.get('/profile', application.authenticate, routes.profile.index.get);
http.put('/profile', application.authenticate, routes.profile.index.put);
http.post('/profile/nick',  application.authenticate, routes.profile.nick.post);


http.get('/feeds',          application.authenticate, routes.feeds.index.get);
http.post('/feeds/feed',    application.authenticate, routes.feeds.feed.post);
http.delete('/feeds/feed',  application.authenticate, routes.feeds.feed.delete);

process.on('uncaughtException', function(err) {
  logger.error(err);
});

http.listen(config.get('bind_to').port);

socket.listen(http, sessionStore);

if (http.address() == null){
  logger.error("Error listening to " + JSON.stringify(config.get('bind_to')));
  process.exit(1);
}
logger.info(("MoTown HTTP server listening on port %d in %s mode", http.address().port, http.settings.env));
