Number.prototype.seconds = function(){return this * 1000};
Number.prototype.second = Number.prototype.seconds;
Number.prototype.minutes = function(){return this.seconds() * 60};
Number.prototype.minute = Number.prototype.minutes;
Number.prototype.hours = function(){return this.minutes() * 60};
Number.prototype.hour = Number.prototype.hours;
Number.prototype.days = function(){return this.hours() * 24};
Number.prototype.day = Number.prototype.days
