echo . \
  & sh -c ". ~/.nvm/nvm.sh; nvm install 14.15; nvm use 14.15; npx c8 --clean false -r none ava;" \
  & sh -c ". ~/.nvm/nvm.sh; nvm install 14   ; nvm use 14   ; npx c8 --clean false -r none ava;" \
  & sh -c ". ~/.nvm/nvm.sh; nvm install 16.13; nvm use 16.13; npx c8 --clean false -r none ava;" \
  & sh -c ". ~/.nvm/nvm.sh; nvm install 16   ; nvm use 16   ; npx c8 --clean false -r none ava;" \
  & sh -c ". ~/.nvm/nvm.sh; nvm install 17   ; nvm use 17   ; npx c8 --clean false -r none ava;" \