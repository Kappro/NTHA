import type * as types from './types';
import type { ConfigOptions, FetchResponse } from 'api/dist/core'
import Oas from 'oas';
import APICore from 'api/dist/core';
import definition from './openapi.json';

class SDK {
  spec: Oas;
  core: APICore;

  constructor() {
    this.spec = Oas.init(definition);
    this.core = new APICore(this.spec, 'fsq-developers-places/20250617 (api/6.1.3)');
  }

  /**
   * Optionally configure various options that the SDK allows.
   *
   * @param config Object of supported SDK options and toggles.
   * @param config.timeout Override the default `fetch` request timeout of 30 seconds. This number
   * should be represented in milliseconds.
   */
  config(config: ConfigOptions) {
    this.core.setConfig(config);
  }

  /**
   * If the API you're using requires authentication you can supply the required credentials
   * through this method and the library will magically determine how they should be used
   * within your API request.
   *
   * With the exception of OpenID and MutualTLS, it supports all forms of authentication
   * supported by the OpenAPI specification.
   *
   * @example <caption>HTTP Basic auth</caption>
   * sdk.auth('username', 'password');
   *
   * @example <caption>Bearer tokens (HTTP or OAuth 2)</caption>
   * sdk.auth('myBearerToken');
   *
   * @example <caption>API Keys</caption>
   * sdk.auth('myApiKey');
   *
   * @see {@link https://spec.openapis.org/oas/v3.0.3#fixed-fields-22}
   * @see {@link https://spec.openapis.org/oas/v3.1.0#fixed-fields-22}
   * @param values Your auth credentials for the API; can specify up to two strings or numbers.
   */
  auth(...values: string[] | number[]) {
    this.core.setAuth(...values);
    return this;
  }

  /**
   * If the API you're using offers alternate server URLs, and server variables, you can tell
   * the SDK which one to use with this method. To use it you can supply either one of the
   * server URLs that are contained within the OpenAPI definition (along with any server
   * variables), or you can pass it a fully qualified URL to use (that may or may not exist
   * within the OpenAPI definition).
   *
   * @example <caption>Server URL with server variables</caption>
   * sdk.server('https://{region}.api.example.com/{basePath}', {
   *   name: 'eu',
   *   basePath: 'v14',
   * });
   *
   * @example <caption>Fully qualified server URL</caption>
   * sdk.server('https://eu.api.example.com/v14');
   *
   * @param url Server URL
   * @param variables An object of variables to replace into the server URL.
   */
  server(url: string, variables = {}) {
    this.core.setServer(url, variables);
  }

  /**
   * Returns a list of top places, geos, and/or searches partially matching the provided
   * keyword and location inputs.
   *
   * @summary Autocomplete
   */
  autocomplete(metadata: types.AutocompleteMetadataParam): Promise<FetchResponse<200, types.AutocompleteResponse200>> {
    return this.core.fetch('/autocomplete', 'get', metadata);
  }

  /**
   * Search for places in the FSQ Places database using a location and querying by name,
   * category name, telephone number, taste label, or chain name. For example, search for
   * "coffee" to get back a list of recommended coffee shops. 
   *
   * You may pass a location with your request by using one of the following options. If none
   * of the following options are passed, Place Search defaults to geolocation using ip
   * biasing with the optional radius parameter.
   *
   * <ul><li>ll & radius (circular boundary)</li><li>near (geocodable locality)</li><li>ne &
   * sw (rectangular boundary)</li></ul>
   *
   * @summary Place Search
   */
  placeSearch(metadata: types.PlaceSearchMetadataParam): Promise<FetchResponse<200, types.PlaceSearchResponse200>> {
    return this.core.fetch('/places/search', 'get', metadata);
  }

  /**
   * Retrieve comprehensive information and metadata for a FSQ Place using the fsq_place_id.
   *
   * @summary Get Place Details
   */
  placeDetails(metadata: types.PlaceDetailsMetadataParam): Promise<FetchResponse<200, types.PlaceDetailsResponse200>> {
    return this.core.fetch('/places/{fsq_place_id}', 'get', metadata);
  }

  /**
   * Retrieve tips for a FSQ Place using the fsq_place_id.
   *
   * @summary Get Place Tips
   */
  placeTips(metadata: types.PlaceTipsMetadataParam): Promise<FetchResponse<200, types.PlaceTipsResponse200>> {
    return this.core.fetch('/places/{fsq_place_id}/tips', 'get', metadata);
  }

  /**
   * Retrieve photos for a FSQ Place using the fsq_place_id. 
   *
   * To retrieve photos from a Photos response, learn [how to assemble photo
   * URLs](https://docs.foursquare.com/reference/photos-guide#assembling-a-photo-url).
   *
   * @summary Get Place Photos
   */
  placePhotos(metadata: types.PlacePhotosMetadataParam): Promise<FetchResponse<200, types.PlacePhotosResponse200>> {
    return this.core.fetch('/places/{fsq_place_id}/photos', 'get', metadata);
  }

  /**
   * Suggest the merge of two or more places.
   *
   * @summary Merge Places
   */
  suggestMerge(metadata: types.SuggestMergeMetadataParam): Promise<FetchResponse<200, types.SuggestMergeResponse200>> {
    return this.core.fetch('/places/{fsq_place_id}/suggest/merge', 'post', metadata);
  }

  /**
   * Suggest edits to an existing Place’s information such as address, phone number, and
   * hours of operation via its `fsq_place_id`. Providing values for the parameters below
   * constitute the proposed edit.
   *
   * @summary Edit a Place
   */
  placeSuggestEdit(metadata: types.PlaceSuggestEditMetadataParam): Promise<FetchResponse<200, types.PlaceSuggestEditResponse200>> {
    return this.core.fetch('/places/{fsq_place_id}/suggest/edit', 'post', metadata);
  }

  /**
   * Flag an entire place for removal for reasons such as closed, doesn't exist,
   * inappropriate, or private.
   *
   * @summary Remove a Place
   */
  placeSuggestRemove(metadata: types.PlaceSuggestRemoveMetadataParam): Promise<FetchResponse<200, types.PlaceSuggestRemoveResponse200>> {
    return this.core.fetch('/places/{fsq_place_id}/suggest/remove', 'post', metadata);
  }

  /**
   * Flag a field(s) on a Place as incorrect. Does not require you to provide the correct
   * value.
   *
   * @summary Flag a Place
   */
  placeFlag(metadata: types.PlaceFlagMetadataParam): Promise<FetchResponse<200, types.PlaceFlagResponse200>> {
    return this.core.fetch('/places/{fsq_place_id}/suggest/flag', 'post', metadata);
  }

  /**
   * Add a new place that does not currently exist. We will first attempt to find a match in
   * our database. If we do not find a match, we will create a new suggested place.
   *
   * @summary Suggest a New Place
   */
  placesSuggestPlace(metadata: types.PlacesSuggestPlaceMetadataParam): Promise<FetchResponse<200, types.PlacesSuggestPlaceResponse200>> {
    return this.core.fetch('/places/suggest/place', 'post', metadata);
  }

  /**
   * Monitor the status of the places edits provided by your users or service keys.
   *
   * @summary Get Suggestion Status
   */
  placeSuggestStatus(metadata: types.PlaceSuggestStatusMetadataParam): Promise<FetchResponse<200, types.PlaceSuggestStatusResponse200>> {
    return this.core.fetch('/places/suggest/status', 'get', metadata);
  }

  /**
   * Get a list of the top places that need review for a given location.
   *
   * @summary Get Places With Pending Suggested Edits
   */
  placeTopVenueWoes(metadata: types.PlaceTopVenueWoesMetadataParam): Promise<FetchResponse<200, types.PlaceTopVenueWoesResponse200>> {
    return this.core.fetch('/places/suggest/review', 'get', metadata);
  }

  /**
   * Utilize Foursquare's Snap to Place technology to detect where your user's device is and
   * what is around them.
   *
   * This endpoint will intentionally return lower quality results not found in Place Search.
   * It is not intended to replace Place Search as the primary way to search for top,
   * recommended POIs.
   *
   * @summary Find Geotagging Candidates
   */
  geotaggingCandidates(metadata: types.GeotaggingCandidatesMetadataParam): Promise<FetchResponse<200, types.GeotaggingCandidatesResponse200>> {
    return this.core.fetch('/geotagging/candidates', 'get', metadata);
  }

  /**
   * Report the selection of a place as the result of a Geotagging Candidates request.
   *
   * @summary Confirm Geotagging Candidate Selection
   */
  geotaggingConfirm(metadata: types.GeotaggingConfirmMetadataParam): Promise<FetchResponse<200, types.GeotaggingConfirmResponse200>> {
    return this.core.fetch('/geotagging/confirm', 'post', metadata);
  }
}

const createSDK = (() => { return new SDK(); })()
;

export default createSDK;

export type { AutocompleteMetadataParam, AutocompleteResponse200, GeotaggingCandidatesMetadataParam, GeotaggingCandidatesResponse200, GeotaggingConfirmMetadataParam, GeotaggingConfirmResponse200, PlaceDetailsMetadataParam, PlaceDetailsResponse200, PlaceFlagMetadataParam, PlaceFlagResponse200, PlacePhotosMetadataParam, PlacePhotosResponse200, PlaceSearchMetadataParam, PlaceSearchResponse200, PlaceSuggestEditMetadataParam, PlaceSuggestEditResponse200, PlaceSuggestRemoveMetadataParam, PlaceSuggestRemoveResponse200, PlaceSuggestStatusMetadataParam, PlaceSuggestStatusResponse200, PlaceTipsMetadataParam, PlaceTipsResponse200, PlaceTopVenueWoesMetadataParam, PlaceTopVenueWoesResponse200, PlacesSuggestPlaceMetadataParam, PlacesSuggestPlaceResponse200, SuggestMergeMetadataParam, SuggestMergeResponse200 } from './types';
