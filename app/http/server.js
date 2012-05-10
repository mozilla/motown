#!/usr/local/bin/node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */



// Module dependencies.
const 
express = require('express'),
passport = require('passport'),
util = require('util'),
application = require('./controllers/application'),
redis = require('../../lib/redis'),
BrowserID = require('passport-browserid').Strategy;

const config = require('../../lib/configuration');

passport.serializeUser(function(user, done) {
  done(null, user.email);
});

passport.deserializeUser(function(email, done) {
  done(null, { email: email });
});

passport.use(new BrowserID({
    audience: config.get('public_url')
  },
  function(email, done) {
    redis.get('user:' + email, function(err, data){
      if (data == null){
        redis.set('user:' + email, '', function(err, data){});
      }
      return done(null, { email: email });
    });
  }
));

var http = express.createServer();


// Express Configuration
http.configure(function(){
  http.set('views', __dirname + '/views');
  http.set('view engine', 'ejs');

  http.use(express.logger());
  http.use(express.static(__dirname + '/public'));
  http.use(express.logger());
  http.use(express.cookieParser());
  http.use(express.bodyParser());
  http.use(express.methodOverride());
  //TODO: Load secret from config/env var
  http.use(express.session({secret: 'As a kid I ran down the stairs at full speed because I imagined Indians with bows and arrows would hit me if I walked.'}));
  
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
  site: require('./controllers/site'),
  social: require('./controllers/social'),
  stories: require('./controllers/stories'),
  users: require('./controllers/users')
};


http.get('/', routes.site.index);
http.get('/login', routes.site.login);
http.post('/auth/browserid', passport.authenticate('browserid', { failureRedirect: '/login' }), routes.site.authenticate);
http.get('/logout', routes.site.logout);
http.get('/account', application.authenticate, function(req, res){
  res.render('site/account', { user: req.user });
});

http.get('/social/worker.js', application.authenticate, routes.social.worker);
http.get('/social/sidebar.js', application.authenticate, routes.social.sidebar);

http.get('/stories', application.authenticate, routes.stories.index);
http.get('/users', application.authenticate, routes.users.index);

process.on('uncaughtException', function(err) {
  logger.error(err);
});

http.listen(config.get('bind_to').port);
if (http.address() == null){
  logger.error("Error listening to " + JSON.stringify(config.get('bind_to')));
  process.exit(1);
}
console.log("MoTown HTTP server listening on port %d in %s mode", http.address().port, http.settings.env);
