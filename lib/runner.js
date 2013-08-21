var
	_               = require('lodash'),
	assert          = require('assert'),
	fs              = require('fs'),
	yaml            = require('js-yaml'),
	FiveBeansWorker = require('./worker')
	;

var FiveBeansRunner = function(id, configpath)
{
	assert(id);
	assert(configpath);

	this.id = id;
	this.configpath = configpath;

	if (typeof configpath === 'string')
	{
		if (configpath[0] !== '/')
			configpath = process.cwd() + '/' + configpath;

		if (!fs.existsSync(configpath))
			throw(new Error(configpath + ' does not exist'));
	}

	this.worker = null;
	return this;
};

FiveBeansRunner.prototype.go = function()
{
	var self = this;

	this.worker = this.createWorker();

	process.on('SIGINT', this.handleStop.bind(this));
	process.on('SIGQUIT', this.handleStop.bind(this));
	process.on('SIGHUP', this.handleStop.bind(this));

	process.on('SIGUSR2', function()
	{
		self.worker.on('stopped', function()
		{
			self.worker = self.createWorker();
		});
		self.worker.logInfo('received SIGUSR2; stopping & reloading configuration');
		self.worker.stop();
	});

	return self;
};

FiveBeansRunner.prototype.readConfiguration = function()
{
	var config;
	var dirprefix = process.cwd() + '/';
	var handlers = {};

	if (typeof this.configpath === 'string')
		config = yaml.load(fs.readFileSync(this.configpath, 'utf8'));
	else
		config = this.configpath;

	for (var i = 0, len = config.handlers.length; i < len; i++)
	{
		var h = config.handlers[i];
		if (typeof h === 'string')
			h = require(dirprefix + h);
		if (typeof h === 'function')
			h = h();
		handlers[h.type] = h;
	}
	config.handlers = handlers;

	return config;
};

FiveBeansRunner.prototype.createWorker = function()
{
	var config = _.extend({}, this.readConfiguration());
	var options =
	{
		id: this.id,
		host: config.beanstalkd.host,
		port: config.beanstalkd.port,
		handlers: config.handlers,
		ignoreDefault: config.ignoreDefault
	};

	var worker = new FiveBeansWorker(options);
	worker.start(config.watch);
	return worker;
};

FiveBeansRunner.prototype.handleStop = function()
{
	this.worker.on('stopped', function()
	{
		process.exit(0);
	});
	this.worker.stop();
};

module.exports = FiveBeansRunner;
