import { DistributedCache } from "./DistributedCache";
import { RedisCache } from "./RedisCache";

export const distributedCache = new DistributedCache(new RedisCache());
