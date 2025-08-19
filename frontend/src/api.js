import axios from 'axios'
export const api = axios.create({ baseURL: 'https://pterolite.mydomain.com', headers: { 'x-api-key':'supersecretkey' } })