import Resource from 'ember-api-store/models/resource';
import Ember from 'ember';
import ReadLabels from 'ui/mixins/read-labels';
import C from 'ui/utils/constants';

var _allMaps;
var _allServices;
var _allLbServices;
var _allExternalServices;
var _allDnsServices;

var Service = Resource.extend(ReadLabels, {
  type: 'service',

  actions: {
    activate: function() {
      return this.doAction('activate');
    },

    deactivate: function() {
      return this.doAction('deactivate');
    },

    cancelUpgrade: function() {
      return this.doAction('cancelupgrade');
    },

    cancelRollback: function() {
      return this.doAction('cancelrollback');
    },

    finishUpgrade: function() {
      return this.doAction('finishupgrade');
    },

    rollback: function() {
      return this.doAction('rollback');
    },


    edit: function() {
      var type = this.get('type').toLowerCase();
      if ( type === 'loadbalancerservice' )
      {
        this.importLink('loadBalancerListeners').then(() => {
          this.get('application').setProperties({
            editLoadBalancerService: true,
            originalModel: this,
          });
        });
      }
      else if ( type === 'dnsservice' )
      {
        this.get('application').setProperties({
          editAliasService: true,
          originalModel: this,
        });
      }
      else
      {
        this.get('application').setProperties({
          editService: true,
          originalModel: this,
        });
      }
    },

    scaleUp: function() {
      this.incrementProperty('scale');
      this.saveScale();
    },

    scaleDown: function() {
      if ( this.get('scale') >= 1 )
      {
        this.decrementProperty('scale');
        this.saveScale();
      }
    },

    clone: function() {
      var route;
      switch ( this.get('type').toLowerCase() )
      {
        case 'service':             route = 'service.new';          break;
        case 'dnsservice':          route = 'service.new-alias';    break;
        case 'loadbalancerservice': route = 'service.new-balancer'; break;
        case 'externalservice':     route = 'service.new-external'; break;
        default: return void this.send('error','Unknown service type: ' + this.get('type'));
      }

      this.get('application').transitionToRoute(route, {queryParams: {
        serviceId: this.get('id'),
        environmentId: this.get('environmentId'),
      }});
    },
  },

  scaleTimer: null,
  saveScale: function() {
    if ( this.get('scaleTimer') )
    {
      Ember.run.cancel(this.get('scaleTimer'));
    }

    var timer = Ember.run.later(this, function() {
      this.save();
    }, 500);

    this.set('scaleTimer', timer);
  },

  availableActions: function() {
    var a = this.get('actionLinks');

    var choices = [
      { label: 'Start',         icon: 'icon icon-play',         action: 'activate',     enabled: !!a.activate,    color: 'text-success'},
      { label: 'Stop',          icon: 'icon icon-pause',        action: 'deactivate',   enabled: !!a.deactivate,  color: 'text-danger'},
      { label: 'Delete',        icon: 'icon icon-trash',        action: 'promptDelete', enabled: !!a.remove, altAction: 'delete', color: 'text-warning' },
      { label: 'Purge',         icon: '',                       action: 'purge',        enabled: !!a.purge },
      { divider: true },
      { label: 'Finish Upgrade',  icon: 'fa fa-thumbs-o-up',          action: 'finishUpgrade',       enabled: !!a.finishupgrade },
      { label: 'Cancel Upgrade',  icon: 'fa fa-life-ring',            action: 'cancelUpgrade',       enabled: !!a.cancelupgrade },
      { label: 'Rollback',        icon: 'fa fa-history',              action: 'rollback',            enabled: !!a.rollback },
      { label: 'Cancel Rollback', icon: 'fa fa-life-ring',            action: 'cancelRollback',      enabled: !!a.cancelrollback },
      { divider: true },
      { label: 'View in API',   icon: 'icon icon-externallink', action: 'goToApi',      enabled: true },
      { label: 'Clone',         icon: 'icon icon-copy',         action: 'clone',        enabled: true },
      { label: 'Edit',          icon: 'icon icon-edit',         action: 'edit',         enabled: !!a.update },
    ];

    return choices;
  }.property('actionLinks.{activate,deactivate,update,remove,purge,finishupgrade,cancelupgrade,rollback,cancelrollback}'),


  _allMaps: null,
  consumedServicesUpdated: 0,
  serviceLinks: null, // Used for clone
  reservedKeys: ['_allMaps','consumedServices','consumedServicesUpdated','serviceLinks','_environment','_environmentState'],
  labelResource: Ember.computed.alias('launchConfig'),

  init: function() {
    this._super();

    // Hack: keep only one copy of all the services and serviceconsumemaps
    // But you have to load service and serviceconsumemap beforehand somewhere...
    // Bonus hack: all('services') doesn't include the other kinds of services, so load all those too.
    if ( !_allMaps )
    {
      _allMaps = this.get('store').allUnremoved('serviceconsumemap');
    }

    // And we need this here so that consumedServices can watch for changes
    this.set('_allMaps', _allMaps);

    if ( !_allServices )
    {
      _allServices = this.get('store').allUnremoved('service');
    }

    if ( !_allLbServices )
    {
      _allLbServices = this.get('store').allUnremoved('loadbalancerservice');
    }

    if ( !_allExternalServices )
    {
      _allExternalServices = this.get('store').allUnremoved('externalservice');
    }

    if ( !_allDnsServices )
    {
      _allDnsServices = this.get('store').allUnremoved('dnsservice');
    }
  },


  _environment: null,
  _environmentState: 0,
  displayEnvironment: function() {
    var env = this.get('_environment');
    if ( env )
    {
      return env.get('displayName');
    }
    else if ( this && this.get('_environmentState') === 2 )
    {
      return '???';
    }
    else if ( this && this.get('_environmentState') === 0 )
    {
      var existing = this.get('store').getById('environment', this.get('environmentId'));
      if ( existing )
      {
        this.set('_environment', existing);
        return existing.get('displayName');
      }

      this.set('_environmentState', 1);
      this.get('store').find('environment', this.get('environmentId')).then((env) => {
        this.set('_environment', env);
      }).catch(() => {
        this.set('_publicIpState', 2);
      });

      return '...';
    }

    return null;
  }.property('_environment.displayName','_environmentState','environmentId'),

  onDisplayEnvironmentChanged: function() {
    this.incrementProperty('consumedServicesUpdated');
  }.observes('displayEnvironment'),

  consumedServicesWithNames: function() {
    return Service.consumedServicesFor(this.get('id'));
  }.property('id','_allMaps.@each.{name,serviceId,consumedServiceId}'),

  consumedServices: function() {
    return this.get('consumedServicesWithNames').map((obj) => {
      return obj.get('service');
    });
  }.property('consumedServicesWithNames.@each.service'),

  onConsumedServicesChanged: function() {
    this.incrementProperty('consumedServicesUpdated');
  }.observes('consumedServicesWithNames.@each.{name,service}'),

  healthState: function() {
    var isGlobal = Object.keys(this.get('labels')||{}).indexOf(C.LABEL.SCHED_GLOBAL) >= 0;
    var instances = this.get('instances')||[];

    // Get the state of each instance
    var healthy = 0;
    instances.forEach((instance) => {
      var resource = instance.get('state');
      var health = instance.get('healthState');

      if ( ['running','active','updating-active'].indexOf(resource) >= 0 && (health === 'healthy' || health === null) )
      {
        healthy++;
      }
    });

    if ( (isGlobal && healthy >= instances.get('length')) || (!isGlobal && healthy >= this.get('scale')) )
    {
      return 'healthy';
    }
    else
    {
      return 'unhealthy';
    }
  }.property('instances.@each.{state,healthState}'),

  combinedState: function() {
    var service = this.get('state');
    var health = this.get('healthState');

    if ( ['active','updating-active'].indexOf(service) === -1 )
    {
      // If the service isn't active, return its state
      return service;
    }

    if ( health === 'healthy' )
    {
      return service;
    }
    else
    {
      return 'degraded';
    }
  }.property('state', 'healthState'),

  canScale: function() {
    if ( ['service','loadbalancerservice'].indexOf(this.get('type').toLowerCase()) >= 0 )
    {
      return !this.getLabel(C.LABEL.SCHED_GLOBAL);
    }
    else
    {
      return false;
    }
  }.property('type'),

  hasContainers: function() {
    return ['service','loadbalancerservice'].indexOf(this.get('type').toLowerCase()) >= 0;
  }.property('type'),

  hasImage: function() {
    return this.get('type') === 'service';
  }.property('type'),
  hasLabels: Ember.computed.alias('hasImage'),

  displayType: function() {
    var out;
    switch ( this.get('type').toLowerCase() )
    {
      case 'loadbalancerservice': out = 'Load Balancer'; break;
      case 'dnsservice':          out = 'DNS'; break;
      case 'externalservice':     out = 'External'; break;
      default:                    out = 'Container'; break;
    }

    return out;
  }.property('type'),

  activeIcon: function() {
    return activeIcon(this);
  }.property('type'),

});

export function activeIcon(service)
{
  var out = 'icon icon-layergroup';
  switch ( service.get('type').toLowerCase() )
  {
    case 'loadbalancerservice': out = 'icon icon-fork';    break;
    case 'dnsservice':          out = 'icon icon-compass'; break;
    case 'externalservice':     out = 'icon icon-cloud';   break;
  }

  return out;
}

Service.reopenClass({
  consumedServicesFor: function(serviceId) {
    var allTypes = [_allServices, _allLbServices, _allExternalServices, _allDnsServices];

    return _allMaps.filterBy('serviceId', serviceId).map((map) => {
      var i = 0;
      var service = null;
      while ( i < allTypes.length && !service )
      {
        service = allTypes[i].filterBy('id', map.get('consumedServiceId'))[0];
        i++;
      }

      return Ember.Object.create({
        name: map.get('name'),
        service: service,
        ports: map.get('ports')||[],
      });
    }).filter((obj) => {
      return obj.get('service.id');
    });
  },

  stateMap: {
    'active':           {icon: activeIcon,          color: 'text-success'},
    'upgrading':        {icon: 'icon-arrow-up',     color: 'text-info'},
    'canceling-upgrade':{icon: 'icon-arrow-down',   color: 'text-info'},
  }
});

export default Service;
