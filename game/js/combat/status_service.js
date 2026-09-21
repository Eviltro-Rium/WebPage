/* Canonical status mutation service.
 *
 * StatusRegistry owns metadata; StatusService owns every stack/boolean write.
 * Combat and adventure code can keep reading the legacy entity properties, but
 * all new mutations should go through this boundary.
 */
(function (global) {
  const root = global.FurryGame || (global.FurryGame = {});
  const registry = root.StatusRegistry;
  if (!registry) throw new Error('status_service.js requires status_registry.js');

  const def = id => registry.get(id);
  const clamp = (definition, value) => {
    if (!definition) return 0;
    if (!definition.stack) return value ? true : false;
    return Math.max(0, Math.min(definition.max == null ? Infinity : definition.max, Number(value) || 0));
  };

  function ensure(entity, defaults = null) {
    if (!entity) return entity;
    registry.all.forEach(definition => {
      const property = definition.property;
      if (entity[property] === undefined || entity[property] === null) {
        const fallback = defaults && Object.prototype.hasOwnProperty.call(defaults, definition.id)
          ? defaults[definition.id]
          : (definition.stack ? 0 : false);
        entity[property] = clamp(definition, fallback);
      } else {
        entity[property] = clamp(definition, entity[property]);
      }
    });
    return entity;
  }

  function read(entity, id) {
    const definition = def(id);
    return definition && entity ? entity[definition.property] : undefined;
  }

  function set(entity, id, value) {
    const definition = def(id);
    if (!definition || !entity) return 0;
    entity[definition.property] = clamp(definition, value);
    return registry.amount(entity, id);
  }

  function add(entity, id, amount = 1) {
    const definition = def(id);
    if (!definition || !entity) return 0;
    const delta = Number(amount) || 0;
    if (!definition.stack) return set(entity, id, delta > 0 ? true : read(entity, id));
    return set(entity, id, registry.amount(entity, id) + delta);
  }

  function remove(entity, id, amount = 1) {
    const definition = def(id);
    if (!definition || !entity || !registry.has(entity, id)) return 0;
    if (!definition.stack) return set(entity, id, false);
    return set(entity, id, registry.amount(entity, id) - Math.max(0, Number(amount) || 0));
  }

  function clear(entity, id, mode = null) {
    const definition = def(id);
    if (!definition || !entity) return false;
    const result = registry.clear(entity, id, mode || definition.cleanse);
    // hypnosisArmed is an internal phase marker, not a registered status.
    // Clearing hypnosis/sleep must clear it as well or a later application
    // would incorrectly promote immediately on the next defense.
    if ((id === 'hypnosis' || id === 'sleep') && !registry.has(entity, 'hypnosis')) {
      entity.hypnosisArmed = false;
    }
    return result;
  }

  function clearGroup(entity, polarity, mode = 'all') {
    const removed = registry.clearGroup(entity, polarity, mode);
    if (polarity === 'debuff' && !registry.has(entity, 'hypnosis')) {
      entity.hypnosisArmed = false;
    }
    return removed;
  }

  function clearAll(entity) {
    if (!entity) return [];
    return registry.all.filter(definition => registry.has(entity, definition.id))
      .map(definition => { clear(entity, definition.id, 'all'); return definition.id; });
  }

  function snapshot(entity) {
    if (!entity) return {};
    const result = {};
    registry.all.forEach(definition => { result[definition.id] = registry.value(entity, definition.id); });
    return result;
  }

  function restore(entity, values) {
    if (!entity || !values) return entity;
    registry.all.forEach(definition => {
      if (Object.prototype.hasOwnProperty.call(values, definition.id)) {
        set(entity, definition.id, values[definition.id]);
      }
    });
    return entity;
  }

  const api = Object.freeze({
    registry,
    all: registry.all,
    get: registry.get,
    value: registry.value,
    ensure,
    read,
    set,
    add,
    remove,
    clear,
    clearGroup,
    clearAll,
    snapshot,
    restore,
    amount: registry.amount,
    has: registry.has,
    list: registry.list
  });
  root.StatusService = api;
  global.StatusService = api;
})(window);
